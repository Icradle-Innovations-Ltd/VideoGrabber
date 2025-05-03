import { spawn } from "child_process";
import { Readable } from "stream";
import { VideoInfo, DownloadOptions } from "@shared/schema";
import { storage } from "../storage";
import path from "path";
import os from "os";
import fs from "fs";
import { PassThrough } from "stream";

// Function to get video information using yt-dlp
export async function getVideoInfo(videoId: string): Promise<VideoInfo> {
  try {
    // Check if we have cached info for this video
    const cachedInfo = await storage.getCachedVideoInfo(videoId);
    if (cachedInfo) {
      return cachedInfo;
    }

    // Execute yt-dlp to get video info in JSON format with all available formats
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    
    return new Promise((resolve, reject) => {
      const ytDlp = spawn("yt-dlp", [
        "--dump-json",
        "--no-playlist",
        "--list-formats",
        "--force-ipv4",
        "--geo-bypass",
        "--no-check-certificates",
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
  // Standard resolution labels for consistent presentation
  const standardResolutions = {
    "144p": { height: 144, label: "144p" },
    "240p": { height: 240, label: "240p" },
    "360p": { height: 360, label: "360p" },
    "480p": { height: 480, label: "480p" },
    "720p": { height: 720, label: "720p HD" },
    "1080p": { height: 1080, label: "1080p FullHD" },
    "1440p": { height: 1440, label: "1440p QHD" },
    "2160p": { height: 2160, label: "2160p 4K" },
    "4320p": { height: 4320, label: "4320p 8K" }
  };
  
  // Add standard audio quality labels
  const audioQualityLabels: Record<string, string> = {
    "tiny": "Low Quality",
    "low": "Medium Quality",
    "medium": "High Quality",
    "high": "Very High Quality"
  };
  
  // Process the formats
  const formats = ytDlpFormats
    .filter(format => 
      // Filter out formats with no filesize or very small files
      (format.filesize && format.filesize > 1000) || 
      // Include formats with estimated filesize
      (format.filesize_approx && format.filesize_approx > 1000) ||
      // Include formats even if we don't know filesize (sometimes it's not reported)
      (!format.filesize && !format.filesize_approx && 
       ((format.vcodec && format.vcodec !== "none") || 
        (format.acodec && format.acodec !== "none")))
    )
    .map(format => {
      // Determine actual resolution and quality label
      let qualityLabel = format.format_note || "";
      const hasVideo = !!format.vcodec && format.vcodec !== "none";
      const hasAudio = !!format.acodec && format.acodec !== "none";
      const height = format.height || 0;
      
      // Create better quality labels based on resolution for videos
      if (hasVideo && height > 0) {
        // Find the closest standard resolution
        let closestRes = "";
        let minDiff = Infinity;
        
        for (const res in standardResolutions) {
          const diff = Math.abs(standardResolutions[res].height - height);
          if (diff < minDiff) {
            minDiff = diff;
            closestRes = res;
          }
        }
        
        if (closestRes) {
          qualityLabel = standardResolutions[closestRes].label;
        } else {
          qualityLabel = `${height}p`;
        }
      } 
      // For audio-only formats, use better labels
      else if (!hasVideo && hasAudio) {
        if (format.abr) {
          qualityLabel = `${Math.round(format.abr)}kbps Audio`;
        } else if (format.format_note && audioQualityLabels[format.format_note.toLowerCase()]) {
          qualityLabel = audioQualityLabels[format.format_note.toLowerCase()];
        } else {
          qualityLabel = "Audio";
        }
      }
      
      return {
        formatId: format.format_id,
        extension: format.ext || "unknown",
        quality: format.format_note || "unknown",
        qualityLabel: qualityLabel,
        hasAudio: hasAudio,
        hasVideo: hasVideo,
        filesize: format.filesize || format.filesize_approx || 
                  // Estimate filesize for formats that don't report it
                  (hasVideo ? (height * height * 60) : 3000000), 
        audioChannels: format.audio_channels,
      };
    });
    
  // Remove duplicates based on resolution and audio/video combo
  const uniqueFormats: VideoInfo["formats"] = [];
  const seen = new Set<string>();
  
  for (const format of formats) {
    // Create a unique key based on important properties
    const key = `${format.hasVideo ? '1' : '0'}-${format.hasAudio ? '1' : '0'}-${format.qualityLabel}-${format.extension}`;
    
    if (!seen.has(key)) {
      seen.add(key);
      uniqueFormats.push(format);
    }
  }
  
  return uniqueFormats;
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
  
  // Create a pass-through stream to handle errors
  const outputStream = new PassThrough();
  
  // Build yt-dlp arguments with additional options to bypass restrictions
  const args = [
    "--no-playlist",
    "-f", formatId,
    "-o", "-", // Output to stdout
    "--force-ipv4", // Force IPv4 to avoid some restrictions
    "--geo-bypass", // Try to bypass geo-restrictions
    "--extractor-retries", "3", // Retry 3 times if extraction fails
    "--no-check-certificates", // Don't verify SSL certificates
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
  
  console.log("Starting download with args:", args.join(" "));
  
  // Spawn yt-dlp process
  const ytDlp = spawn("yt-dlp", args);
  
  let errorMessage = "";
  
  // Handle errors
  ytDlp.stderr.on("data", (data) => {
    const message = data.toString();
    errorMessage += message;
    console.error(`yt-dlp stderr: ${message}`);
    
    // Check for specific errors
    if (message.includes("HTTP Error 403: Forbidden")) {
      console.log("YouTube is blocking this download. Trying to work around restrictions...");
    }
  });
  
  ytDlp.on("error", (error) => {
    console.error("Failed to start yt-dlp:", error);
    outputStream.emit("error", new Error(`Download failed: ${error.message}`));
    outputStream.end();
  });
  
  ytDlp.on("close", (code) => {
    if (code !== 0) {
      console.error(`yt-dlp process exited with code ${code}`);
      
      // Try to give a more specific error message
      let userMessage = "Download failed";
      if (errorMessage.includes("HTTP Error 403: Forbidden")) {
        userMessage = "YouTube is preventing this download due to restrictions";
      } else if (errorMessage.includes("This video is unavailable")) {
        userMessage = "This video is unavailable or private";
      } else if (errorMessage.includes("Video unavailable")) {
        userMessage = "This video is unavailable or has been removed";
      } else if (errorMessage.includes("Sign in to confirm your age")) {
        userMessage = "This video requires age verification and cannot be downloaded";
      }
      
      outputStream.emit("error", new Error(userMessage));
      outputStream.end();
    }
  });
  
  // Pipe the stdout to our passthrough stream
  ytDlp.stdout.pipe(outputStream);
  
  return outputStream;
}
