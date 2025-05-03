import { spawn } from "child_process";
import { Readable } from "stream";
import { VideoInfo, DownloadOptions } from "@shared/schema";
import { storage } from "../storage";
import path from "path";
import os from "os";
import fs from "fs";

// Function to get video information using yt-dlp
export async function getVideoInfo(videoId: string): Promise<VideoInfo> {
  try {
    // Check if we have cached info for this video
    const cachedInfo = await storage.getCachedVideoInfo(videoId);
    if (cachedInfo) {
      return cachedInfo;
    }

    // Execute yt-dlp to get video info in JSON format
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    
    return new Promise((resolve, reject) => {
      const ytDlp = spawn("yt-dlp", [
        "--dump-json",
        "--no-playlist",
        url
      ]);

      let outputData = "";
      let errorData = "";

      ytDlp.stdout.on("data", (data) => {
        outputData += data.toString();
      });

      ytDlp.stderr.on("data", (data) => {
        errorData += data.toString();
      });

      ytDlp.on("close", (code) => {
        if (code !== 0) {
          console.error(`yt-dlp exited with code ${code}`, errorData);
          reject(new Error(`Failed to get video info: ${errorData || "Unknown error"}`));
          return;
        }

        try {
          const rawData = JSON.parse(outputData);
          
          // Transform yt-dlp output to our VideoInfo format
          const videoInfo: VideoInfo = {
            id: videoId,
            title: rawData.title || "",
            description: rawData.description || "",
            thumbnailUrl: rawData.thumbnail || "",
            duration: rawData.duration || 0,
            channel: rawData.uploader || "",
            formats: parseFormats(rawData.formats || []),
            subtitles: parseSubtitles(rawData.requested_subtitles || {}, rawData.subtitles || {}),
          };

          // Cache the video info
          storage.saveVideoInfo(videoInfo);
          
          resolve(videoInfo);
        } catch (error) {
          console.error("Error parsing yt-dlp output:", error);
          reject(new Error("Failed to parse video information"));
        }
      });
    });
  } catch (error) {
    console.error("Error getting video info:", error);
    throw error;
  }
}

// Parse yt-dlp formats to our format structure
function parseFormats(ytDlpFormats: any[]): VideoInfo["formats"] {
  return ytDlpFormats
    .filter(format => 
      // Filter out formats with no filesize or very small files
      (format.filesize && format.filesize > 1000) || 
      // Include formats with estimated filesize
      (format.filesize_approx && format.filesize_approx > 1000)
    )
    .map(format => ({
      formatId: format.format_id,
      extension: format.ext || "unknown",
      quality: format.format_note || "unknown",
      qualityLabel: format.resolution || format.format_note || undefined,
      hasAudio: !!format.acodec && format.acodec !== "none",
      hasVideo: !!format.vcodec && format.vcodec !== "none",
      filesize: format.filesize || format.filesize_approx || 0,
      audioChannels: format.audio_channels,
    }));
}

// Parse yt-dlp subtitles to our subtitle structure
function parseSubtitles(requestedSubtitles: any, availableSubtitles: any): VideoInfo["subtitles"] {
  const result: VideoInfo["subtitles"] = [];
  
  // Add available subtitles
  for (const [lang, data] of Object.entries(availableSubtitles)) {
    result.push({
      lang,
      name: (data as any).name || getLangNameFromCode(lang),
    });
  }
  
  return result;
}

// Helper function to get language name from code
function getLangNameFromCode(code: string): string {
  const langMap: Record<string, string> = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "ru": "Russian",
    "ja": "Japanese",
    "ko": "Korean",
    "zh": "Chinese",
    "ar": "Arabic",
  };
  
  return langMap[code] || code;
}

// Function to download a video
export async function downloadVideo(options: DownloadOptions): Promise<Readable> {
  const { videoId, formatId, start, end, subtitle, subtitleFormat } = options;
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  
  // Create temp directory for downloads if it doesn't exist
  const tempDir = path.join(os.tmpdir(), "youtube-downloader");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  // Build yt-dlp arguments
  const args = [
    "--no-playlist",
    "-f", formatId,
    "-o", "-", // Output to stdout
  ];
  
  // Add trim options if present
  if (start !== undefined && end !== undefined) {
    args.push("--download-sections", `*${start}-${end}`);
  }
  
  // Add subtitle options if present
  if (subtitle && subtitleFormat) {
    args.push("--write-subs");
    args.push("--sub-langs", subtitle);
    args.push("--sub-format", subtitleFormat);
  }
  
  // Add the URL as the last argument
  args.push(url);
  
  // Spawn yt-dlp process
  const ytDlp = spawn("yt-dlp", args);
  
  // Handle errors
  ytDlp.stderr.on("data", (data) => {
    console.error(`yt-dlp stderr: ${data}`);
  });
  
  ytDlp.on("error", (error) => {
    console.error("Failed to start yt-dlp:", error);
  });
  
  // Return stdout as a readable stream
  return ytDlp.stdout;
}
