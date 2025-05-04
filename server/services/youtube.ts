import { spawn } from "child_process";
import { Readable, PassThrough } from "stream";
import { VideoInfo, DownloadOptions, PlaylistInfo } from "@shared/schema";
import { storage } from "../storage";
import path from "path";
import os from "os";
import fs from "fs/promises";
import { promisify } from "util";
import { pipeline } from "stream";

// Configuration object for yt-dlp settings
const YTDLP_CONFIG = {
  retries: 10,
  fragmentRetries: 20,
  retrySleep: 1,
  bufferSize: "16M",
  socketTimeout: 180,
  throttledRate: "10M",
  concurrentFragments: 5,
  userAgent:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  headers: {
    "Accept-Language": "en-US,en;q=0.9",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    Referer: "https://www.youtube.com",
  },
  extractorArgs: "youtube:player_client=android,web",
};

// Helper function to extract playlist ID from URL
function extractPlaylistId(url: string): string | null {
  const regExp = /(?:list=)([a-zA-Z0-9_-]+)/;
  const match = url.match(regExp);
  return match ? match[1] : null;
}

// Helper function to execute yt-dlp with common arguments
async function executeYtdlp(
  args: string[],
  outputToFile = false,
): Promise<{ output: string; error: string; code: number }> {
  return new Promise((resolve, reject) => {
    const ytDlp = spawn("yt-dlp", args);
    let outputData = "";
    let errorData = "";

    ytDlp.stdout.on("data", (data) => {
      outputData += data.toString();
    });

    ytDlp.stderr.on("data", (data) => {
      errorData += data.toString();
    });

    ytDlp.on("error", (error) => {
      reject(new Error(`Failed to start yt-dlp: ${error.message}`));
    });

    ytDlp.on("close", (code) => {
      resolve({ output: outputData, error: errorData, code });
    });
  });
}

// Function to get video or playlist information using yt-dlp
export async function getVideoInfo(
  videoId: string,
  url?: string,
): Promise<VideoInfo> {
  try {
    // Check cache first
    const cachedInfo = await storage.getCachedVideoInfo(videoId);
    if (cachedInfo) {
      console.log(`Returning cached video info for videoId: ${videoId}`);
      return cachedInfo;
    }

    const videoUrl = url || `https://www.youtube.com/watch?v=${videoId}`;
    const playlistId = extractPlaylistId(videoUrl);

    // Handle playlist if present
    if (playlistId) {
      try {
        const videoInfo = await getVideoWithPlaylistInfo(
          videoId,
          videoUrl,
          playlistId,
        );
        await storage.saveVideoInfo(videoInfo);
        return videoInfo;
      } catch (error) {
        console.warn(
          `Failed to get playlist info for ${playlistId}, falling back to single video:`,
          error,
        );
      }
    }

    // Common yt-dlp arguments for video info
    const args = [
      "--dump-json",
      "--no-playlist",
      "--force-ipv4",
      "--geo-bypass",
      "--extractor-retries",
      String(YTDLP_CONFIG.retries),
      "--ignore-errors",
      "--no-check-certificates",
      "--no-warnings",
      "--skip-download",
      "--list-formats", // Ensure we get all formats
      "--extract-audio",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0", // Best quality, we'll generate others manually
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      "all",
      "--prefer-free-formats",
      ...Object.entries(YTDLP_CONFIG.headers).flatMap(([key, value]) => [
        "--add-header",
        `${key}:${value}`,
      ]),
      "--user-agent",
      YTDLP_CONFIG.userAgent,
      "--extractor-args",
      YTDLP_CONFIG.extractorArgs,
      videoUrl,
    ];

    const { output, error, code } = await executeYtdlp(args);

    if (code !== 0) {
      throw new Error(`yt-dlp failed with code ${code}: ${error}`);
    }

    const cleanedOutput = output.trim().split("\n").pop() || "";
    const rawData = JSON.parse(cleanedOutput);

    // Generate additional audio formats at different bitrates
    const audioFormats = await generateAudioFormats(videoUrl);

    // Combine video and audio formats
    const allFormats = [...(rawData.formats || []), ...audioFormats];

    const videoInfo: VideoInfo = {
      id: videoId,
      title: rawData.title || "Unknown Title",
      description: rawData.description || "",
      thumbnailUrl: rawData.thumbnail || "",
      duration: rawData.duration || 0,
      channel: rawData.uploader || "Unknown Channel",
      formats: parseFormats(allFormats),
      subtitles: parseSubtitles(
        rawData.requested_subtitles || {},
        rawData.subtitles || {},
      ),
    };

    await storage.saveVideoInfo(videoInfo);
    return videoInfo;
  } catch (error) {
    console.error(`Error fetching video info for ${videoId}:`, error);
    throw new Error(
      `Failed to get video info: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }
}

// Helper function to generate MP3 formats at different bitrates
async function generateAudioFormats(videoUrl: string): Promise<any[]> {
  const bitrates = ["320", "256", "192", "128"];
  const audioFormats: any[] = [];

  for (const bitrate of bitrates) {
    const args = [
      "--dump-json",
      "--no-playlist",
      "--force-ipv4",
      "--geo-bypass",
      "--extractor-retries",
      String(YTDLP_CONFIG.retries),
      "--ignore-errors",
      "--no-check-certificates",
      "--no-warnings",
      "--skip-download",
      "--extract-audio",
      "--audio-format",
      "mp3",
      "--audio-quality",
      bitrate,
      ...Object.entries(YTDLP_CONFIG.headers).flatMap(([key, value]) => [
        "--add-header",
        `${key}:${value}`,
      ]),
      "--user-agent",
      YTDLP_CONFIG.userAgent,
      "--extractor-args",
      YTDLP_CONFIG.extractorArgs,
      videoUrl,
    ];

    const { output, error, code } = await executeYtdlp(args);
    if (code !== 0) {
      console.warn(
        `Failed to generate audio format at ${bitrate}kbps: ${error}`,
      );
      continue;
    }

    const cleanedOutput = output.trim().split("\n").pop() || "";
    const rawData = JSON.parse(cleanedOutput);

    const audioFormat = {
      format_id: `audio-mp3-${bitrate}`,
      ext: "mp3",
      acodec: "mp3",
      vcodec: "none",
      format_note: `${bitrate}kbps`,
      abr: parseInt(bitrate),
      filesize:
        rawData.filesize || (rawData.duration * parseInt(bitrate) * 1000) / 8, // Estimate filesize
    };

    audioFormats.push(audioFormat);
  }

  return audioFormats;
}

// Function to get video info with additional playlist information
async function getVideoWithPlaylistInfo(
  videoId: string,
  videoUrl: string,
  playlistId: string,
): Promise<VideoInfo> {
  const args = [
    "--dump-json",
    "--flat-playlist",
    "--force-ipv4",
    "--geo-bypass",
    "--extractor-retries",
    String(YTDLP_CONFIG.retries),
    "--ignore-errors",
    "--no-check-certificates",
    "--no-warnings",
    `https://www.youtube.com/playlist?list=${playlistId}`,
  ];

  const { output, error, code } = await executeYtdlp(args);

  if (code !== 0) {
    throw new Error(`Failed to get playlist info: ${error}`);
  }

  const playlistItems: VideoInfo["playlistItems"] = [];
  const lines = output.split("\n").filter((line) => line.trim());

  let playlistTitle = "YouTube Playlist";
  let playlistThumbnail = "";

  for (let i = 0; i < lines.length; i++) {
    try {
      const item = JSON.parse(lines[i]);
      if (i === 0) {
        playlistTitle = item.playlist || "YouTube Playlist";
        playlistThumbnail = item.thumbnail || "";
      }

      playlistItems.push({
        id: item.id,
        title: item.title || `Video ${i + 1}`,
        duration: item.duration || 0,
        thumbnailUrl: item.thumbnail || "",
        position: i,
      });
    } catch (error) {
      console.warn(`Error parsing playlist item ${i}:`, error);
    }
  }

  const singleVideoInfo = await getVideoInfo(videoId);
  return {
    ...singleVideoInfo,
    isPlaylist: true,
    playlistItems,
  };
}

// Function to get only playlist information
export async function getPlaylistInfo(
  playlistId: string,
): Promise<PlaylistInfo> {
  const args = [
    "--dump-json",
    "--flat-playlist",
    "--force-ipv4",
    "--geo-bypass",
    "--extractor-retries",
    String(YTDLP_CONFIG.retries),
    "--ignore-errors",
    "--no-check-certificates",
    "--no-warnings",
    `https://www.youtube.com/playlist?list=${playlistId}`,
  ];

  const { output, error, code } = await executeYtdlp(args);

  if (code !== 0) {
    throw new Error(`Failed to get playlist info: ${error}`);
  }

  const videos: PlaylistInfo["videos"] = [];
  const lines = output.split("\n").filter((line) => line.trim());

  let playlistTitle = "YouTube Playlist";
  let playlistThumbnail = "";
  let channelTitle = "";

  for (let i = 0; i < lines.length; i++) {
    try {
      const item = JSON.parse(lines[i]);
      if (i === 0) {
        playlistTitle = item.playlist || "YouTube Playlist";
        playlistThumbnail = item.thumbnail || "";
        channelTitle = item.uploader || "";
      }

      videos.push({
        id: item.id,
        title: item.title || `Video ${i + 1}`,
        duration: item.duration || 0,
        thumbnailUrl: item.thumbnail || "",
        position: i,
      });
    } catch (error) {
      console.warn(`Error parsing playlist item ${i}:`, error);
    }
  }

  return {
    id: playlistId,
    title: playlistTitle,
    thumbnailUrl: playlistThumbnail,
    channelTitle,
    videos,
  };
}

// Parse yt-dlp formats to our format structure
function parseFormats(ytDlpFormats: any[]): VideoInfo["formats"] {
  const standardResolutions = [
    "2160p",
    "1440p",
    "1080p",
    "720p",
    "480p",
    "360p",
    "240p",
    "144p",
  ];
  const audioBitrates = ["320", "256", "192", "128"];

  const formats = ytDlpFormats
    .filter((format) => {
      const isMP4 = format.ext === "mp4" && format.vcodec !== "none";
      const isMP3 = format.ext === "mp3" && format.acodec !== "none";
      return isMP4 || isMP3;
    })
    .map((format) => {
      const hasVideo = !!format.vcodec && format.vcodec !== "none";
      const hasAudio = !!format.acodec && format.acodec !== "none";
      const height = format.height || 0;
      let qualityLabel = format.format_note || "unknown";

      if (hasVideo && height > 0) {
        const resolutionLabel = standardResolutions.find((res) =>
          res.startsWith(height.toString()),
        );
        qualityLabel = `MP4 - ${resolutionLabel || `${height}p`}${hasAudio ? " with Audio" : " (Video Only)"}`;
        if (height >= 2160) qualityLabel += " 4K";
        else if (height >= 1440) qualityLabel += " 2K";
        else if (height >= 1080) qualityLabel += " Full HD";
        else if (height >= 720) qualityLabel += " HD";
      } else if (!hasVideo && hasAudio && format.ext === "mp3") {
        const audioBitrate = format.abr || 128;
        const closestBitrate =
          audioBitrates.find(
            (br) => Math.abs(parseInt(br) - audioBitrate) <= 10,
          ) || audioBitrate.toString();
        qualityLabel = `MP3 - ${closestBitrate}kbps`;
      }

      return {
        formatId: format.format_id,
        extension: format.ext || "unknown",
        quality: format.format_note || "unknown",
        qualityLabel,
        hasAudio,
        hasVideo,
        filesize:
          format.filesize ||
          format.filesize_approx ||
          (hasVideo ? height * height * 60 : 3000000),
        audioChannels: format.audio_channels || 2,
      };
    })
    .sort((a, b) => {
      const heightA = a.hasVideo
        ? parseInt(a.qualityLabel.match(/\d+p/)?.[0] || "0")
        : 0;
      const heightB = b.hasVideo
        ? parseInt(b.qualityLabel.match(/\d+p/)?.[0] || "0")
        : 0;
      if (heightA !== heightB) return heightB - heightA;
      return (b.filesize || 0) - (a.filesize || 0);
    });

  const uniqueFormats: VideoInfo["formats"] = [];
  const seen = new Set<string>();

  for (const format of formats) {
    const key = `${format.hasVideo ? "1" : "0"}-${format.hasAudio ? "1" : "0"}-${format.qualityLabel}-${format.extension}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueFormats.push(format);
    }
  }

  // Ensure all desired formats are present
  const finalFormats: VideoInfo["formats"] = [];
  const videoWithAudioFormats = uniqueFormats.filter(
    (f) => f.hasVideo && f.hasAudio,
  );
  const videoOnlyFormats = uniqueFormats.filter(
    (f) => f.hasVideo && !f.hasAudio,
  );
  const audioOnlyFormats = uniqueFormats.filter(
    (f) => !f.hasVideo && f.hasAudio,
  );

  // Ensure all video with audio resolutions
  for (const res of standardResolutions) {
    const height = parseInt(res);
    const existing = videoWithAudioFormats.find(
      (f) =>
        f.hasVideo &&
        f.hasAudio &&
        parseInt(f.qualityLabel.match(/\d+p/)?.[0] || "0") === height,
    );
    if (existing) {
      finalFormats.push(existing);
    } else {
      // Fallback: Create a placeholder format if not found
      const baseFormat = videoWithAudioFormats[0] || videoOnlyFormats[0];
      if (baseFormat) {
        finalFormats.push({
          ...baseFormat,
          formatId: `placeholder-${res}-audio`,
          qualityLabel: `MP4 - ${res} with Audio${height >= 2160 ? " 4K" : height >= 1440 ? " 2K" : height >= 1080 ? " Full HD" : height >= 720 ? " HD" : ""}`,
          filesize: height * height * 60,
          hasAudio: true,
        });
      }
    }
  }

  // Ensure all video only resolutions
  for (const res of standardResolutions) {
    const height = parseInt(res);
    const existing = videoOnlyFormats.find(
      (f) =>
        f.hasVideo &&
        !f.hasAudio &&
        parseInt(f.qualityLabel.match(/\d+p/)?.[0] || "0") === height,
    );
    if (existing) {
      finalFormats.push(existing);
    } else {
      // Fallback: Create a placeholder format if not found
      const baseFormat = videoOnlyFormats[0] || videoWithAudioFormats[0];
      if (baseFormat) {
        finalFormats.push({
          ...baseFormat,
          formatId: `placeholder-${res}-video`,
          qualityLabel: `MP4 - ${res} (Video Only)${height >= 2160 ? " 4K" : height >= 1440 ? " 2K" : height >= 1080 ? " Full HD" : height >= 720 ? " HD" : ""}`,
          filesize: height * height * 60,
          hasAudio: false,
        });
      }
    }
  }

  // Ensure all audio bitrates
  for (const bitrate of audioBitrates) {
    const existing = audioOnlyFormats.find((f) =>
      f.qualityLabel.includes(`${bitrate}kbps`),
    );
    if (existing) {
      finalFormats.push(existing);
    } else {
      // Fallback: Create a placeholder format if not found
      const baseFormat = audioOnlyFormats[0] || {
        filesize: 3000000,
        audioChannels: 2,
      };
      finalFormats.push({
        formatId: `placeholder-mp3-${bitrate}`,
        extension: "mp3",
        quality: `${bitrate}kbps`,
        qualityLabel: `MP3 - ${bitrate}kbps`,
        hasAudio: true,
        hasVideo: false,
        filesize: baseFormat.filesize,
        audioChannels: baseFormat.audioChannels,
      });
    }
  }

  return finalFormats;
}

// Parse yt-dlp subtitles to our subtitle structure
function parseSubtitles(
  requestedSubtitles: any,
  availableSubtitles: any,
): VideoInfo["subtitles"] {
  const result: VideoInfo["subtitles"] = [];
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
    en: "English",
    es: "Spanish",
    fr: "French",
    de: "German",
    it: "Italian",
    pt: "Portuguese",
    ru: "Russian",
    ja: "Japanese",
    ko: "Korean",
    zh: "Chinese",
    ar: "Arabic",
  };
  return langMap[code] || code;
}

// Function to download a video or playlist
export async function downloadVideo(
  options: DownloadOptions,
): Promise<Readable> {
  const {
    videoId,
    formatId,
    start,
    end,
    subtitle,
    subtitleFormat,
    isPlaylist,
    playlistItems,
  } = options;
  const outputStream = new PassThrough();

  if (isPlaylist && playlistItems && playlistItems.length > 0) {
    return downloadPlaylist(options);
  }

  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const tempDir = path.join(os.tmpdir(), "youtube-downloader");
  const tempFilePath = path.join(
    tempDir,
    `${videoId}_${formatId}_${Date.now()}.temp`,
  );

  try {
    await fs.mkdir(tempDir, { recursive: true });
    try {
      console.log(`Attempting direct download for video ${videoId}`);
      await downloadUsingDirectMethod(
        url,
        formatId,
        outputStream,
        start,
        end,
        subtitle,
        subtitleFormat,
      );
      return outputStream;
    } catch (error) {
      console.warn(
        `Direct download failed for ${videoId}, trying file method:`,
        error,
      );
      await downloadUsingFileMethod(
        url,
        formatId,
        tempFilePath,
        outputStream,
        start,
        end,
        subtitle,
        subtitleFormat,
      );
      return outputStream;
    }
  } catch (error) {
    console.error(`Download failed for ${videoId}:`, error);
    outputStream.emit(
      "error",
      new Error(
        "Failed to download video. Please try a different format or video.",
      ),
    );
    outputStream.end();
    return outputStream;
  }
}

// Function to download a playlist
async function downloadPlaylist(options: DownloadOptions): Promise<Readable> {
  const { formatId, playlistItems } = options;
  if (!playlistItems || playlistItems.length === 0) {
    throw new Error("No playlist items provided for download");
  }

  const tempDir = path.join(os.tmpdir(), `youtube-playlist-${Date.now()}`);
  const outputStream = new PassThrough();

  try {
    await fs.mkdir(tempDir, { recursive: true });
    const args = [
      "-f",
      formatId,
      "--force-ipv4",
      "--geo-bypass",
      "--no-check-certificates",
      "--ignore-errors",
      "--output",
      path.join(tempDir, "%(title)s.%(ext)s"),
      ...playlistItems.map((id) => `https://www.youtube.com/watch?v=${id}`),
    ];

    const { error, code } = await executeYtdlp(args);
    if (code !== 0) {
      throw new Error(`Playlist download failed: ${error}`);
    }

    const files = await fs.readdir(tempDir);
    if (files.length === 0) {
      throw new Error("No files were downloaded from the playlist");
    }

    if (files.length === 1) {
      const filePath = path.join(tempDir, files[0]);
      const fileStream = await fs
        .readFile(filePath)
        .then((data) => Readable.from(data));
      await pipeline(fileStream, outputStream, async () => {
        await fs
          .unlink(filePath)
          .catch((err) => console.warn(`Error deleting ${filePath}:`, err));
        await fs
          .rmdir(tempDir)
          .catch((err) => console.warn(`Error deleting ${tempDir}:`, err));
      });
      return outputStream;
    }

    const zipPath = path.join(
      os.tmpdir(),
      `youtube-playlist-${Date.now()}.zip`,
    );
    const zip = spawn("zip", [
      "-j",
      zipPath,
      ...files.map((file) => path.join(tempDir, file)),
    ]);
    await new Promise((resolve, reject) => {
      zip.on("close", (code) =>
        code === 0
          ? resolve(null)
          : reject(new Error("Failed to create zip file")),
      );
      zip.on("error", reject);
    });

    const zipStream = await fs
      .readFile(zipPath)
      .then((data) => Readable.from(data));
    await pipeline(zipStream, outputStream, async () => {
      await Promise.all([
        ...files.map((file) =>
          fs
            .unlink(path.join(tempDir, file))
            .catch((err) => console.warn(`Error deleting ${file}:`, err)),
        ),
        fs
          .unlink(zipPath)
          .catch((err) => console.warn(`Error deleting ${zipPath}:`, err)),
        fs
          .rmdir(tempDir)
          .catch((err) => console.warn(`Error deleting ${tempDir}:`, err)),
      ]);
    });

    return outputStream;
  } catch (error) {
    console.error("Playlist download failed:", error);
    outputStream.emit(
      "error",
      new Error("Failed to process playlist download"),
    );
    outputStream.end();
    return outputStream;
  }
}

// Method 1: Direct download to stdout
async function downloadUsingDirectMethod(
  url: string,
  formatId: string,
  outputStream: PassThrough,
  start?: number,
  end?: number,
  subtitle?: string,
  subtitleFormat?: string,
): Promise<void> {
  const args = [
      "--no-playlist",
      "-f",
      formatId,
      "-o",
      "-",
      "--force-ipv4",
      "--geo-bypass",
      "--no-check-certificates",
      "--no-warnings",
      "--no-cache-dir",
      "--rm-cache-dir",
      "--cookies-from-browser", "chrome",
      "--extract-audio",
      "--audio-quality", "0",
      "--format-sort", "quality",
      "--prefer-free-formats",
      ...Object.entries(YTDLP_CONFIG.headers).flatMap(([key, value]) => [
        "--add-header",
        `${key}:${value}`,
      ]),
      "--user-agent",
      YTDLP_CONFIG.userAgent,
      "--extractor-args",
      YTDLP_CONFIG.extractorArgs,
      url,
  ];

  if (start !== undefined && end !== undefined) {
    args.push("--download-sections", `*${start}-${end}`);
  }
  if (subtitle && subtitleFormat) {
    args.push(
      "--write-subs",
      "--sub-langs",
      subtitle,
      "--sub-format",
      subtitleFormat,
    );
  }

  const { error, code } = await executeYtdlp(args);
  if (code !== 0) {
    const errorMessage = error.includes("HTTP Error 403")
      ? "YouTube restrictions prevent this download"
      : error.includes("Video unavailable")
        ? "This video is unavailable or private"
        : error.includes("Sign in to confirm your age")
          ? "This video requires age verification"
          : "Download failed";
    throw new Error(errorMessage);
  }
}

// Method 2: Download to a temporary file
async function downloadUsingFileMethod(
  url: string,
  formatId: string,
  tempFilePath: string,
  outputStream: PassThrough,
  start?: number,
  end?: number,
  subtitle?: string,
  subtitleFormat?: string,
): Promise<void> {
  const args = [
    "--no-playlist",
    "-f",
    formatId,
    "--merge-output-format",
    "mp4",
    "-o",
    tempFilePath,
    "--force-ipv4",
    "--geo-bypass",
    "--ignore-errors",
    "--no-check-certificates",
    "--no-warnings",
    "--extractor-retries",
    String(YTDLP_CONFIG.retries),
    "--fragment-retries",
    String(YTDLP_CONFIG.fragmentRetries),
    "--retry-sleep",
    String(YTDLP_CONFIG.retrySleep),
    "--throttled-rate",
    "100K",
    "--buffer-size",
    "16K",
    url,
  ];

  if (start !== undefined && end !== undefined) {
    args.push("--download-sections", `*${start}-${end}`);
  }
  if (subtitle && subtitleFormat) {
    args.push(
      "--write-subs",
      "--sub-langs",
      subtitle,
      "--sub-format",
      subtitleFormat,
    );
  }

  const { error, code } = await executeYtdlp(args, true);
  if (
    code !== 0 ||
    !(await fs
      .stat(tempFilePath)
      .then((stat) => stat.size > 0)
      .catch(() => false))
  ) {
    throw new Error(error || "Failed to download video to file");
  }

  const fileStream = await fs
    .readFile(tempFilePath)
    .then((data) => Readable.from(data));
  await pipeline(fileStream, outputStream, async () => {
    await fs
      .unlink(tempFilePath)
      .catch((err) => console.warn(`Error deleting ${tempFilePath}:`, err));
  });
}