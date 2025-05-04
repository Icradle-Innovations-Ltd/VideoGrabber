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

// Helper function to execute yt-dlp with streaming support
async function executeYtdlp(
  args: string[],
  outputStream?: PassThrough,
  outputToFile = false,
): Promise<{ error: string; code: number }> {
  return new Promise((resolve, reject) => {
    const ytDlp = spawn("yt-dlp", args);
    let errorData = "";

    ytDlp.stderr.on("data", (data) => {
      errorData += data.toString();
      console.error(`yt-dlp stderr: ${data.toString()}`);
    });

    if (outputStream && !outputToFile) {
      ytDlp.stdout.pipe(outputStream);
    } else if (outputToFile) {
      // Handle file output separately if needed
    }

    ytDlp.on("error", (error) => {
      reject(new Error(`Failed to start yt-dlp: ${error.message}`));
    });

    ytDlp.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`yt-dlp failed with code ${code}: ${errorData}`));
      }
      resolve({ error: errorData, code });
    });
  });
}

// Function to get video or playlist information using yt-dlp
export async function getVideoInfo(
  videoId: string,
  url?: string,
): Promise<VideoInfo> {
  try {
    const cachedInfo = await storage.getCachedVideoInfo(videoId);
    if (cachedInfo) {
      console.log(`Returning cached video info for videoId: ${videoId}`);
      return cachedInfo;
    }

    const videoUrl = url || `https://www.youtube.com/watch?v=${videoId}`;
    const playlistId = extractPlaylistId(videoUrl);

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
      "--list-formats",
      "--extract-audio",
      "--audio-format",
      "mp3",
      "--audio-quality",
      "0",
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

    const audioFormats = await generateAudioFormats(videoUrl);
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
    throw error;
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
        rawData.filesize || (rawData.duration * parseInt(bitrate) * 1000) / 8,
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
        formatId:
          format.format_id ||
          `fallback-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        extension: format.ext || "unknown",
        quality: format.format_note || "unknown",
        qualityLabel,
        hasAudio,
        hasVideo,
        filesize:
          format.filesize ||
          format.filesize_approx ||
          (hasVideo ? height * height * 60 : 3000000),
        audioChannels: format.audioChannels || 2,
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

  return uniqueFormats;
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

    // Validate formatId against cached video info
    const videoInfo = await getVideoInfo(videoId);
    const validFormat = videoInfo.formats.find((f) => f.formatId === formatId);
    if (
      !validFormat ||
      formatId.startsWith("placeholder-") ||
      formatId.startsWith("fallback-")
    ) {
      throw new Error(
        `Invalid or placeholder formatId: ${formatId}. Please select a valid format.`,
      );
    }

    console.log(
      `Attempting direct download for video ${videoId} with format ${formatId}`,
    );
    try {
      await downloadUsingDirectMethod(
        url,
        formatId,
        outputStream,
        start,
        end,
        subtitle,
        subtitleFormat,
      );
      console.log(`Direct download succeeded for ${videoId}`);
      return outputStream;
    } catch (directError) {
      console.warn(
        `Direct download failed for ${videoId}:`,
        directError.message,
      );
      console.log(`Attempting file-based download for ${videoId}`);
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
      console.log(`File-based download succeeded for ${videoId}`);
      return outputStream;
    }
  } catch (error) {
    console.error(
      `Download failed for ${videoId} with format ${formatId}:`,
      error,
    );
    const errorMessage = error.message.includes("HTTP Error 403")
      ? "YouTube restrictions prevent this download"
      : error.message.includes("Video unavailable")
        ? "This video is unavailable or private"
        : error.message.includes("Sign in to confirm your age")
          ? "This video requires age verification"
          : "Failed to download video. Please try a different format or video.";
    outputStream.emit("error", new Error(errorMessage));
    outputStream.end();
    return outputStream;
  } finally {
    // Cleanup temp dir if empty
    try {
      const files = await fs.readdir(tempDir);
      if (files.length === 0) await fs.rmdir(tempDir).catch(() => {});
    } catch (e) {
      console.warn(`Error cleaning up temp dir ${tempDir}:`, e);
    }
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
    "--extractor-retries",
    String(YTDLP_CONFIG.retries),
    "--fragment-retries",
    String(YTDLP_CONFIG.fragmentRetries),
    "--retry-sleep",
    String(YTDLP_CONFIG.retrySleep),
    "--throttled-rate",
    YTDLP_CONFIG.throttledRate,
    "--buffer-size",
    YTDLP_CONFIG.bufferSize,
    "--socket-timeout",
    String(YTDLP_CONFIG.socketTimeout),
    "--concurrent-fragments",
    String(YTDLP_CONFIG.concurrentFragments),
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

  try {
    await executeYtdlp(args, outputStream);
  } catch (error) {
    throw new Error(`Direct download failed: ${error.message}`);
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

  try {
    await executeYtdlp(args, undefined, true);
    if (
      !(await fs
        .stat(tempFilePath)
        .then((stat) => stat.size > 0)
        .catch(() => false))
    ) {
      throw new Error("No data downloaded to temporary file");
    }
    const fileStream = await fs
      .readFile(tempFilePath)
      .then((data) => Readable.from(data));
    await pipeline(fileStream, outputStream, async () => {
      await fs
        .unlink(tempFilePath)
        .catch((err) => console.warn(`Error deleting ${tempFilePath}:`, err));
    });
  } catch (error) {
    await fs.unlink(tempFilePath).catch(() => {});
    throw new Error(`File download failed: ${error.message}`);
  }
}
