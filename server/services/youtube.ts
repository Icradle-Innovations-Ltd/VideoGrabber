import { spawn } from "child_process";
import { Readable } from "stream";
import { VideoInfo, DownloadOptions, PlaylistInfo } from "@shared/schema";
import { storage } from "../storage";
import path from "path";
import os from "os";
import fs from "fs";
import { PassThrough } from "stream";

// Helper function to extract playlist ID from URL
function extractPlaylistId(url: string): string | null {
  const regExp = /(?:list=)([a-zA-Z0-9_-]+)/;
  const match = url.match(regExp);
  return match ? match[1] : null;
}

// Function to get video or playlist information using yt-dlp
export async function getVideoInfo(videoId: string, url?: string): Promise<VideoInfo> {
  try {
    // Check if we have cached info for this video
    const cachedInfo = await storage.getCachedVideoInfo(videoId);
    if (cachedInfo) {
      return cachedInfo;
    }

    // Execute yt-dlp to get video info in JSON format
    const videoUrl = url || `https://www.youtube.com/watch?v=${videoId}`;

    // Check if this is a playlist URL
    const playlistId = extractPlaylistId(videoUrl);

    // If it's a playlist, get both video and playlist info
    if (playlistId) {
      try {
        const videoInfo = await getVideoWithPlaylistInfo(videoId, videoUrl, playlistId);
        // Cache the video info
        storage.saveVideoInfo(videoInfo);
        return videoInfo;
      } catch (error) {
        console.error("Error getting playlist info, falling back to single video:", error);
        // Fall back to single video if playlist info fails
      }
    }

    // Get standard video info
    return new Promise((resolve, reject) => {
      const ytDlp = spawn("yt-dlp", [
        "--dump-json",
        "--no-playlist",
        "--force-ipv4",
        "--geo-bypass",
        "--extractor-retries", "10",
        "--ignore-errors",
        "--no-check-certificates",
        "--prefer-insecure",
        "--no-warnings",
        "--skip-download",
        "--format-sort", "res,+size,+br,+proto",
        "--format-sort-force",
        "--all-formats",
        "--write-subs",
        "--write-auto-subs",
        "--sub-langs", "all",
        "--prefer-free-formats",
        "--no-check-formats",
        "--extract-audio",
        "--youtube-skip-dash-manifest",
        "--add-header", "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "--add-header", "Accept-Language:en-US,en;q=0.9",
        "--add-header", "Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "--add-header", "Accept-Encoding:gzip, deflate, br",
        "--add-header", "Referer:https://www.youtube.com",
        "--no-cache-dir",
        "--extractor-args", "youtube:player_client=android,web",
        "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        videoUrl
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
          // Clean the output data to ensure it's valid JSON
          const cleanedOutput = outputData.trim().split('\n').pop() || '';
          const rawData = JSON.parse(cleanedOutput);

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
          console.error("Raw output:", outputData);
          reject(new Error("Failed to parse video information. Please try again."));
        }
      });
    });
  } catch (error) {
    console.error("Error getting video info:", error);
    throw error;
  }
}

// Function to get video info with additional playlist information
async function getVideoWithPlaylistInfo(videoId: string, videoUrl: string, playlistId: string): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    const ytDlp = spawn("yt-dlp", [
      "--dump-json",
      "--flat-playlist", // Don't download the videos, just get the playlist info
      "--force-ipv4",
      "--geo-bypass",
      "--extractor-retries", "5",
      "--ignore-errors",
      "--no-check-certificates",
      "--prefer-insecure",
      "--no-warnings",
      `https://www.youtube.com/playlist?list=${playlistId}`
    ]);

    let outputData = "";
    let errorData = "";

    ytDlp.stdout.on("data", (data) => {
      outputData += data.toString();
    });

    ytDlp.stderr.on("data", (data) => {
      errorData += data.toString();
    });

    ytDlp.on("close", async (code) => {
      if (code !== 0) {
        console.error(`yt-dlp playlist info exited with code ${code}`, errorData);
        reject(new Error(`Failed to get playlist info: ${errorData || "Unknown error"}`));
        return;
      }

      try {
        // Parse the playlist items from the output
        const playlistItems: VideoInfo["playlistItems"] = [];
        const lines = outputData.split('\n').filter(line => line.trim());

        let playlistTitle = "YouTube Playlist";
        let playlistThumbnail = "";

        // Each line is a JSON object representing a video in the playlist
        for (let i = 0; i < lines.length; i++) {
          try {
            const item = JSON.parse(lines[i]);
            if (i === 0) {
              // Use the first video's uploader as the playlist owner
              playlistTitle = item.playlist || "YouTube Playlist";
              playlistThumbnail = item.thumbnail || "";
            }

            playlistItems.push({
              id: item.id,
              title: item.title || `Video ${i + 1}`,
              duration: item.duration || 0,
              thumbnailUrl: item.thumbnail || "",
              position: i
            });
          } catch (error) {
            console.error("Error parsing playlist item:", error);
          }
        }

        // Now get the single video info for the requested video
        const singleVideoInfo = await getVideoInfo(videoId);

        // Combine single video info with playlist info
        const combinedInfo: VideoInfo = {
          ...singleVideoInfo,
          isPlaylist: true,
          playlistItems: playlistItems
        };

        resolve(combinedInfo);
      } catch (error) {
        console.error("Error parsing playlist information:", error);
        reject(new Error("Failed to parse playlist information"));
      }
    });
  });
}

// Function to get only playlist information
export async function getPlaylistInfo(playlistId: string): Promise<PlaylistInfo> {
  return new Promise((resolve, reject) => {
    const ytDlp = spawn("yt-dlp", [
      "--dump-json",
      "--flat-playlist", // Don't download the videos, just get the playlist info
      "--force-ipv4",
      "--geo-bypass",
      "--extractor-retries", "5",
      "--ignore-errors",
      "--no-check-certificates",
      "--prefer-insecure",
      "--no-warnings",
      `https://www.youtube.com/playlist?list=${playlistId}`
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
        console.error(`yt-dlp playlist info exited with code ${code}`, errorData);
        reject(new Error(`Failed to get playlist info: ${errorData || "Unknown error"}`));
        return;
      }

      try {
        // Parse the playlist items from the output
        const videos: PlaylistInfo["videos"] = [];
        const lines = outputData.split('\n').filter(line => line.trim());

        let playlistTitle = "YouTube Playlist";
        let playlistThumbnail = "";
        let channelTitle = "";

        // Each line is a JSON object representing a video in the playlist
        for (let i = 0; i < lines.length; i++) {
          try {
            const item = JSON.parse(lines[i]);
            if (i === 0) {
              // Use the first video's info for playlist metadata
              playlistTitle = item.playlist || "YouTube Playlist";
              playlistThumbnail = item.thumbnail || "";
              channelTitle = item.uploader || "";
            }

            videos.push({
              id: item.id,
              title: item.title || `Video ${i + 1}`,
              duration: item.duration || 0,
              thumbnailUrl: item.thumbnail || "",
              position: i
            });
          } catch (error) {
            console.error("Error parsing playlist item:", error);
          }
        }

        const playlistInfo: PlaylistInfo = {
          id: playlistId,
          title: playlistTitle,
          thumbnailUrl: playlistThumbnail,
          channelTitle: channelTitle,
          videos: videos
        };

        resolve(playlistInfo);
      } catch (error) {
        console.error("Error parsing playlist information:", error);
        reject(new Error("Failed to parse playlist information"));
      }
    });
  });
}

// Parse yt-dlp formats to our format structure
function parseFormats(ytDlpFormats: any[]): VideoInfo["formats"] {
  // Enhanced resolution labels with codec info
  const standardResolutions: Record<string, { height: number; label: string }> = {
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

  // Sort formats by resolution and quality
  ytDlpFormats.sort((a, b) => {
    const heightA = a.height || 0;
    const heightB = b.height || 0;
    if (heightA !== heightB) return heightB - heightA;
    return (b.filesize || 0) - (a.filesize || 0);
  });

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
          const resInfo = standardResolutions[res as keyof typeof standardResolutions];
          const diff = Math.abs(resInfo.height - height);
          if (diff < minDiff) {
            minDiff = diff;
            closestRes = res;
          }
        }

        if (closestRes) {
          qualityLabel = standardResolutions[closestRes as keyof typeof standardResolutions].label;
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
        audioChannels: format.audio_channels || 2, // Default to stereo if not specified
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

// Function to download a video or playlist
export async function downloadVideo(options: DownloadOptions): Promise<Readable> {
  const { videoId, formatId, start, end, subtitle, subtitleFormat, isPlaylist, playlistItems } = options;

  // If this is a playlist download, handle it differently
  if (isPlaylist && playlistItems && playlistItems.length > 0) {
    return downloadPlaylist(options);
  }

  // Single video download
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  // Create temp directory for downloads if it doesn't exist
  const tempDir = path.join(os.tmpdir(), "youtube-downloader");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Create a unique temporary file path for this download
  const tempFilePath = path.join(tempDir, `${videoId}_${formatId}_${Date.now()}.temp`);

  // Create a pass-through stream to handle errors and the final output
  const outputStream = new PassThrough();

  // Try different methods to download the video
  // Method 1: First try direct download to stdout
  try {
    console.log("Attempting direct download method...");
    await downloadUsingDirectMethod(url, formatId, outputStream, start, end, subtitle, subtitleFormat);
    return outputStream;
  } catch (error) {
    console.log("Direct download failed, trying alternative method...", error);

    // Method 2: Try downloading to a temporary file first
    try {
      await downloadUsingFileMethod(url, formatId, tempFilePath, outputStream, start, end, subtitle, subtitleFormat);
      return outputStream;
    } catch (fileError) {
      console.log("All download methods failed:", fileError);
      outputStream.emit("error", new Error("YouTube is preventing this download. Try a different format or video."));
      outputStream.end();
      return outputStream;
    }
  }
}

// Function to download a playlist (multiple videos as a zip)
async function downloadPlaylist(options: DownloadOptions): Promise<Readable> {
  const { videoId, formatId, playlistItems } = options;

  if (!playlistItems || playlistItems.length === 0) {
    throw new Error("No playlist items provided for download");
  }

  // For playlists, we'll create a temp directory to store the videos and then zip them
  const tempDir = path.join(os.tmpdir(), "youtube-playlist-" + Date.now());
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Create a pass-through stream for the final output
  const outputStream = new PassThrough();

  try {
    // Start a separate process to handle the downloads since they can take a while
    const ytDlp = spawn("yt-dlp", [
      "-f", formatId,
      "--force-ipv4",
      "--geo-bypass",
      "--no-check-certificates",
      "--ignore-errors",
      "--output", path.join(tempDir, "%(title)s.%(ext)s"),
      ...playlistItems.map(id => `https://www.youtube.com/watch?v=${id}`)
    ]);

    let errorMessage = "";
    let progressMessage = "";

    ytDlp.stderr.on("data", (data) => {
      errorMessage += data.toString();
      console.error(`Playlist download stderr: ${data.toString()}`);
    });

    ytDlp.stdout.on("data", (data) => {
      progressMessage += data.toString();
      console.log(`Playlist download progress: ${data.toString()}`);
    });

    ytDlp.on("error", (error) => {
      console.error("Failed to start playlist download:", error);
      outputStream.emit("error", new Error(`Playlist download failed: ${error.message}`));
      outputStream.end();
    });

    ytDlp.on("close", async (code) => {
      try {
        // Check if any files were downloaded
        const files = fs.readdirSync(tempDir);

        if (files.length === 0) {
          throw new Error("No files were downloaded from the playlist");
        }

        // For playlists with a single video, just stream the file directly
        if (files.length === 1) {
          const filePath = path.join(tempDir, files[0]);
          const fileStream = fs.createReadStream(filePath);

          fileStream.on("end", () => {
            // Clean up when done
            try {
              fs.unlinkSync(filePath);
              fs.rmdirSync(tempDir);
            } catch (e) {
              console.error("Error cleaning up playlist temp files:", e);
            }
            outputStream.end();
          });

          fileStream.pipe(outputStream);
          return;
        }

        // For multiple files, create a zip file
        const zipPath = path.join(os.tmpdir(), `youtube-playlist-${videoId}-${Date.now()}.zip`);

        // We'll use a simple zip command to create the archive
        const zip = spawn("zip", [
          "-j", // Don't record directory names
          zipPath, 
          ...files.map(file => path.join(tempDir, file))
        ]);

        zip.on("close", async (zipCode) => {
          if (zipCode !== 0) {
            throw new Error("Failed to create playlist zip file");
          }

          // Stream the zip file to the output
          const zipStream = fs.createReadStream(zipPath);

          zipStream.on("end", () => {
            // Clean up when done
            try {
              fs.unlinkSync(zipPath);
              // Delete temp directory and files
              files.forEach(file => {
                try {
                  fs.unlinkSync(path.join(tempDir, file));
                } catch (e) {}
              });
              fs.rmdirSync(tempDir);
            } catch (e) {
              console.error("Error cleaning up playlist zip:", e);
            }
            outputStream.end();
          });

          zipStream.pipe(outputStream);
        });

        zip.on("error", (error) => {
          console.error("Error creating zip file:", error);
          outputStream.emit("error", new Error("Failed to create playlist zip file"));
          outputStream.end();
        });
      } catch (error) {
        console.error("Error processing playlist downloads:", error);
        outputStream.emit("error", new Error("Failed to process playlist download"));
        outputStream.end();
      }
    });

    return outputStream;
  } catch (error) {
    console.error("Error starting playlist download:", error);
    outputStream.emit("error", new Error("Failed to start playlist download"));
    outputStream.end();
    return outputStream;
  }
}

// Method 1: Try direct download to stdout
async function downloadUsingDirectMethod(
  url: string, 
  formatId: string, 
  outputStream: PassThrough,
  start?: number,
  end?: number,
  subtitle?: string,
  subtitleFormat?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Build yt-dlp arguments with additional options to bypass restrictions
    const args = [
      "--no-playlist",
      "-f", formatId,
      "--merge-output-format", "mp4",
      "-o", "%(title)s.%(ext)s", // Output with video title
      "--force-ipv4",
      "--geo-bypass",
      "--no-check-certificates",
      "--prefer-insecure",
      "--no-warnings",
      "--extractor-retries", "10",
      "--fragment-retries", "10",
      "--retry-sleep", "5",
      "--throttled-rate", "2M",
      "--buffer-size", "1M",
      "--socket-timeout", "120",
      "--no-abort-on-error",
      "--no-check-formats",
      "--prefer-free-formats",
      "--add-header", "Accept-Language:en-US,en;q=0.9",
      "--add-header", "Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "--add-header", "Accept-Encoding:gzip, deflate, br",
      "--add-header", "User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
      "--extractor-args", "youtube:player_client=android",
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
    let downloadStarted = false;

    // Handle errors
    ytDlp.stderr.on("data", (data) => {
      const message = data.toString();
      errorMessage += message;
      console.error(`yt-dlp stderr: ${message}`);
    });

    // Handle data (this indicates download is working)
    ytDlp.stdout.on("data", (data) => {
      downloadStarted = true;
      outputStream.write(data);
    });

    ytDlp.on("error", (error) => {
      console.error("Failed to start yt-dlp:", error);
      reject(new Error(`Download failed: ${error.message}`));
    });

    ytDlp.on("close", (code) => {
      if (code !== 0 || !downloadStarted) {
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

        reject(new Error(userMessage));
      } else {
        // Successfully completed
        outputStream.end();
        resolve();
      }
    });
  });
}

// Method 2: Download to a temporary file first, then stream it to the client
async function downloadUsingFileMethod(
  url: string, 
  formatId: string, 
  tempFilePath: string,
  outputStream: PassThrough,
  start?: number,
  end?: number,
  subtitle?: string,
  subtitleFormat?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    // Build yt-dlp arguments to save to a file
    const args = [
      "--no-playlist",
      "-f", formatId,
      "--merge-output-format", "mp4",
      "-o", tempFilePath,
      "--force-ipv4",
      "--geo-bypass",
      "--ignore-errors",
      "--no-check-certificates",
      "--prefer-insecure",
      "--no-warnings",
      "--extractor-retries", "5",
      "--fragment-retries", "5",
      "--retry-sleep", "2",
      "--throttled-rate", "100K",
      "--buffer-size", "16K",
      "--no-part",
      "--socket-timeout", "30",
      "--add-header", "Accept-Language:en-US,en;q=0.9",
      "--add-header", "Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "--add-header", "Accept-Encoding:gzip, deflate",
      "--add-header", "User-Agent:Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "--user-agent", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "--extractor-args", "youtube:player_client=android,web;include_live_dash=1"
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

    // Add output path and URL
    args.push(url);

    console.log("Starting file download with args:", args.join(" "));

    // Spawn yt-dlp process to download to file
    const ytDlp = spawn("yt-dlp", args);

    let errorMessage = "";

    ytDlp.stderr.on("data", (data) => {
      const message = data.toString();
      errorMessage += message;
      console.error(`File download stderr: ${message}`);
    });

    ytDlp.on("error", (error) => {
      console.error("Failed to start file download:", error);
      reject(new Error(`File download failed: ${error.message}`));
    });

    ytDlp.on("close", async (code) => {
      console.log(`File download process exited with code ${code}`);

      // Check if the file was created
      if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 0) {
        try {
          // Stream the file to the output
          const fileStream = fs.createReadStream(tempFilePath);
          fileStream.pipe(outputStream);

          fileStream.on("end", () => {
            // Clean up the temporary file
            try {
              fs.unlinkSync(tempFilePath);
            } catch (unlinkError) {
              console.error("Error deleting temp file:", unlinkError);
            }
            outputStream.end();
            resolve();
          });

          fileStream.on("error", (fsError) => {
            console.error("Error reading temp file:", fsError);
            reject(new Error("Error reading downloaded file"));
          });
        } catch (streamError) {
          console.error("Error setting up file stream:", streamError);
          reject(new Error("Error streaming downloaded file"));
        }
      } else {
        reject(new Error(errorMessage || "Failed to download the video"));
      }
    });
  });
}