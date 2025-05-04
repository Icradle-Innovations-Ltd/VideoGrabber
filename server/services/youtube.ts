import { spawn } from "child_process";
import { Readable, PassThrough } from "stream";
import { VideoInfo, DownloadOptions } from "@shared/schema";
import { storage } from "../storage";
import path from "path";
import os from "os";
import fs from "fs/promises";
import { pipeline } from "stream";

// Core configuration
const YTDLP_CONFIG = {
  retries: 10,
  fragmentRetries: 20,
  retrySleep: 1,
  bufferSize: "16M",
  socketTimeout: 180,
  throttledRate: "10M",
  concurrentFragments: 5,
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  headers: {
    "Accept-Language": "en-US,en;q=0.9",
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    Referer: "https://www.youtube.com"
  },
  extractorArgs: "youtube:player_client=android,web"
};

// Error class for YouTube-related errors
class YouTubeError extends Error {
  constructor(message: string, public code?: number) {
    super(message);
    this.name = 'YouTubeError';
  }
}

// Core utility functions
const utils = {
  extractPlaylistId(url: string): string | null {
    const match = url.match(/(?:list=)([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  },

  async executeYtdlp(args: string[]): Promise<{ output: string; error: string; code: number }> {
    return new Promise((resolve, reject) => {
      const ytDlp = spawn("yt-dlp", args);
      let outputData = "";
      let errorData = "";

      ytDlp.stdout.on("data", (data) => outputData += data.toString());
      ytDlp.stderr.on("data", (data) => errorData += data.toString());
      ytDlp.on("error", (error) => reject(new YouTubeError(`Failed to start yt-dlp: ${error.message}`)));
      ytDlp.on("close", (code) => resolve({ output: outputData, error: errorData, code }));
    });
  },

  getCommonArgs(url: string): string[] {
    return [
      "--no-playlist",
      "--force-ipv4",
      "--geo-bypass",
      "--extractor-retries", String(YTDLP_CONFIG.retries),
      "--ignore-errors",
      "--no-check-certificates",
      "--no-warnings",
      ...Object.entries(YTDLP_CONFIG.headers).flatMap(([key, value]) => ["--add-header", `${key}:${value}`]),
      "--user-agent", YTDLP_CONFIG.userAgent,
      "--extractor-args", YTDLP_CONFIG.extractorArgs,
      url
    ];
  }
};

// Format handling
const formatHandler = {
  async generateAudioFormats(videoUrl: string): Promise<any[]> {
    const bitrates = ["320", "256", "192", "128"];
    const formats = [];

    for (const bitrate of bitrates) {
      try {
        const args = [
          ...utils.getCommonArgs(videoUrl),
          "--dump-json",
          "--extract-audio",
          "--audio-format", "mp3",
          "--audio-quality", bitrate,
          "--skip-download"
        ];

        const { output, code } = await utils.executeYtdlp(args);
        if (code === 0) {
          const data = JSON.parse(output.trim().split("\n").pop() || "");
          formats.push({
            format_id: `audio-mp3-${bitrate}`,
            ext: "mp3",
            acodec: "mp3",
            vcodec: "none",
            format_note: `${bitrate}kbps`,
            abr: parseInt(bitrate),
            filesize: data.filesize || (data.duration * parseInt(bitrate) * 1000) / 8
          });
        }
      } catch (error) {
        console.warn(`Failed to generate ${bitrate}kbps format:`, error);
      }
    }
    return formats;
  },

  parseFormats(ytDlpFormats: any[]): VideoInfo["formats"] {
    const standardResolutions = ["2160p", "1440p", "1080p", "720p", "480p", "360p", "240p", "144p"];
    const formats = ytDlpFormats
      .filter(format => (format.ext === "mp4" && format.vcodec !== "none") || (format.ext === "mp3" && format.acodec !== "none"))
      .map(format => {
        const hasVideo = format.vcodec && format.vcodec !== "none";
        const hasAudio = format.acodec && format.acodec !== "none";
        const height = format.height || 0;
        let qualityLabel = this.generateQualityLabel(format, hasVideo, hasAudio, height);

        return {
          formatId: format.format_id,
          extension: format.ext || "unknown",
          quality: format.format_note || "unknown",
          qualityLabel,
          hasAudio,
          hasVideo,
          filesize: format.filesize || format.filesize_approx || (hasVideo ? height * height * 60 : 3000000),
          audioChannels: format.audio_channels || 2
        };
      })
      .sort((a, b) => {
        const heightA = a.hasVideo ? parseInt(a.qualityLabel.match(/\d+p/)?.[0] || "0") : 0;
        const heightB = b.hasVideo ? parseInt(b.qualityLabel.match(/\d+p/)?.[0] || "0") : 0;
        return heightB - heightA || (b.filesize || 0) - (a.filesize || 0);
      });

    return this.ensureAllFormats(formats, standardResolutions);
  },

  generateQualityLabel(format: any, hasVideo: boolean, hasAudio: boolean, height: number): string {
    if (hasVideo && height > 0) {
      const resolution = this.getResolutionLabel(height);
      return `MP4 - ${resolution}${hasAudio ? " with Audio" : " (Video Only)"}`;
    }
    if (!hasVideo && hasAudio && format.ext === "mp3") {
      const bitrate = format.abr || 128;
      return `MP3 - ${bitrate}kbps`;
    }
    return "unknown";
  },

  getResolutionLabel(height: number): string {
    if (height >= 2160) return `${height}p 4K`;
    if (height >= 1440) return `${height}p 2K`;
    if (height >= 1080) return `${height}p Full HD`;
    if (height >= 720) return `${height}p HD`;
    return `${height}p`;
  },

  ensureAllFormats(formats: VideoInfo["formats"], resolutions: string[]): VideoInfo["formats"] {
    const result = [...formats];

    for (const res of resolutions) {
      const height = parseInt(res);
      this.ensureResolutionFormat(result, height, true);
      this.ensureResolutionFormat(result, height, false);
    }

    return result;
  },

  ensureResolutionFormat(formats: VideoInfo["formats"], height: number, withAudio: boolean): void {
    const exists = formats.some(f => 
      f.hasVideo && 
      (f.hasAudio === withAudio) && 
      parseInt(f.qualityLabel.match(/\d+p/)?.[0] || "0") === height
    );

    if (!exists && formats.length > 0) {
      const baseFormat = formats[0];
      formats.push({
        ...baseFormat,
        formatId: `placeholder-${height}p-${withAudio ? 'audio' : 'video'}`,
        qualityLabel: `MP4 - ${height}p${withAudio ? " with Audio" : " (Video Only)"}${this.getQualitySuffix(height)}`,
        filesize: height * height * 60,
        hasAudio: withAudio,
        hasVideo: true
      });
    }
  },

  getQualitySuffix(height: number): string {
    if (height >= 2160) return " 4K";
    if (height >= 1440) return " 2K";
    if (height >= 1080) return " Full HD";
    if (height >= 720) return " HD";
    return "";
  }
};

// Main API functions
export async function getVideoInfo(videoId: string, url?: string): Promise<VideoInfo> {
  try {
    const cachedInfo = await storage.getCachedVideoInfo(videoId);
    if (cachedInfo) {
      console.log(`Returning cached video info for videoId: ${videoId}`);
      return cachedInfo;
    }

    const videoUrl = url || `https://www.youtube.com/watch?v=${videoId}`;
    const playlistId = utils.extractPlaylistId(videoUrl);

    if (playlistId) {
      try {
        const videoInfo = await getVideoWithPlaylistInfo(videoId, videoUrl, playlistId);
        await storage.saveVideoInfo(videoInfo);
        return videoInfo;
      } catch (error) {
        console.warn(`Failed to get playlist info for ${playlistId}, falling back to single video:`, error);
      }
    }

    const videoInfo = await fetchVideoInfo(videoUrl);
    await storage.saveVideoInfo(videoInfo);
    return videoInfo;
  } catch (error) {
    console.error(`Error fetching video info for ${videoId}:`, error);
    throw new YouTubeError(`Failed to get video info: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

async function fetchVideoInfo(videoUrl: string): Promise<VideoInfo> {
  const args = [
    ...utils.getCommonArgs(videoUrl),
    "--dump-json",
    "--skip-download",
    "--list-formats",
    "--extract-audio",
    "--audio-format", "mp3",
    "--audio-quality", "0",
    "--write-subs",
    "--write-auto-subs",
    "--sub-langs", "all",
    "--prefer-free-formats"
  ];

  const { output, error, code } = await utils.executeYtdlp(args);
  if (code !== 0) {
    throw new YouTubeError(`yt-dlp failed with code ${code}: ${error}`, code);
  }

  const rawData = JSON.parse(output.trim().split("\n").pop() || "");
  const audioFormats = await formatHandler.generateAudioFormats(videoUrl);
  const allFormats = [...(rawData.formats || []), ...audioFormats];

  return {
    id: rawData.id || videoUrl.split("v=")[1],
    title: rawData.title || "Unknown Title",
    description: rawData.description || "",
    thumbnailUrl: rawData.thumbnail || "",
    duration: rawData.duration || 0,
    channel: rawData.uploader || "Unknown Channel",
    formats: formatHandler.parseFormats(allFormats),
    subtitles: Object.entries(rawData.subtitles || {}).map(([lang, data]: [string, any]) => ({
      lang,
      name: data.name || getLangNameFromCode(lang)
    }))
  };
}

// Helper function for playlist info
async function getVideoWithPlaylistInfo(videoId: string, videoUrl: string, playlistId: string): Promise<VideoInfo> {
  const { output, error, code } = await utils.executeYtdlp([
    "--dump-json",
    "--flat-playlist",
    "--force-ipv4",
    "--geo-bypass",
    "--extractor-retries", String(YTDLP_CONFIG.retries),
    "--ignore-errors",
    "--no-check-certificates",
    "--no-warnings",
    `https://www.youtube.com/playlist?list=${playlistId}`
  ]);

  if (code !== 0) {
    throw new YouTubeError(`Failed to get playlist info: ${error}`, code);
  }

  const playlistItems = output
    .split("\n")
    .filter(line => line.trim())
    .map((line, index) => {
      const item = JSON.parse(line);
      return {
        id: item.id,
        title: item.title || `Video ${index + 1}`,
        duration: item.duration || 0,
        thumbnailUrl: item.thumbnail || "",
        position: index
      };
    });

  const singleVideoInfo = await getVideoInfo(videoId);
  return {
    ...singleVideoInfo,
    isPlaylist: true,
    playlistItems
  };
}

// Download functionality
export async function downloadVideo(options: DownloadOptions): Promise<Readable> {
  const { videoId, formatId, start, end, subtitle, subtitleFormat, isPlaylist, playlistItems } = options;
  const outputStream = new PassThrough();

  try {
    if (isPlaylist && playlistItems?.length) {
      return await downloadPlaylist(options);
    }

    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const args = [
      ...utils.getCommonArgs(url),
      "-f", formatId,
      "-o", "-",
      "--fragment-retries", String(YTDLP_CONFIG.fragmentRetries),
      "--retry-sleep", String(YTDLP_CONFIG.retrySleep),
      "--buffer-size", YTDLP_CONFIG.bufferSize,
      "--socket-timeout", String(YTDLP_CONFIG.socketTimeout),
      "--concurrent-fragments", String(YTDLP_CONFIG.concurrentFragments)
    ];

    if (start !== undefined && end !== undefined) {
      args.push("--download-sections", `*${start}-${end}`);
    }
    if (subtitle && subtitleFormat) {
      args.push("--write-subs", "--sub-langs", subtitle, "--sub-format", subtitleFormat);
    }

    const ytDlp = spawn("yt-dlp", args);
    ytDlp.stdout.pipe(outputStream);
    ytDlp.stderr.on("data", (data) => console.warn(`yt-dlp warning: ${data}`));

    await new Promise((resolve, reject) => {
      ytDlp.on("close", (code) => {
        if (code === 0) resolve(null);
        else reject(new Error(`Download failed with code ${code}`));
      });
      ytDlp.on("error", reject);
    });

    return outputStream;
  } catch (error) {
    console.error(`Download failed for ${videoId}:`, error);
    outputStream.emit("error", new Error("Download failed. Please try a different format or video."));
    outputStream.end();
    return outputStream;
  }
}

async function downloadPlaylist(options: DownloadOptions): Promise<Readable> {
  if (!options.playlistItems?.length) {
    throw new Error("No playlist items provided for download");
  }

  const tempDir = path.join(os.tmpdir(), `youtube-playlist-${Date.now()}`);
  const outputStream = new PassThrough();

  try {
    await fs.mkdir(tempDir, { recursive: true });
    const downloadResult = await utils.executeYtdlp([
      "-f", options.formatId,
      "--force-ipv4",
      "--geo-bypass",
      "--no-check-certificates",
      "--ignore-errors",
      "--output", path.join(tempDir, "%(title)s.%(ext)s"),
      ...options.playlistItems.map(id => `https://www.youtube.com/watch?v=${id}`)
    ]);

    if (downloadResult.code !== 0) {
      throw new Error(`Playlist download failed: ${downloadResult.error}`);
    }

    const files = await fs.readdir(tempDir);
    if (files.length === 0) {
      throw new Error("No files were downloaded from the playlist");
    }

    await handlePlaylistOutput(tempDir, files, outputStream);
    return outputStream;
  } catch (error) {
    console.error("Playlist download failed:", error);
    outputStream.emit("error", new Error("Failed to process playlist download"));
    outputStream.end();
    return outputStream;
  }
}

async function handlePlaylistOutput(tempDir: string, files: string[], outputStream: PassThrough): Promise<void> {
  if (files.length === 1) {
    const filePath = path.join(tempDir, files[0]);
    const fileStream = await fs.readFile(filePath).then(data => Readable.from(data));
    await pipeline(fileStream, outputStream);
    await cleanup([filePath, tempDir]);
    return;
  }

  const zipPath = path.join(os.tmpdir(), `youtube-playlist-${Date.now()}.zip`);
  await new Promise<void>((resolve, reject) => {
    const zip = spawn("zip", ["-j", zipPath, ...files.map(file => path.join(tempDir, file))]);
    zip.on("close", code => code === 0 ? resolve() : reject(new Error("Failed to create zip file")));
    zip.on("error", reject);
  });

  const zipStream = await fs.readFile(zipPath).then(data => Readable.from(data));
  await pipeline(zipStream, outputStream);
  await cleanup([...files.map(file => path.join(tempDir, file)), zipPath, tempDir]);
}

async function cleanup(paths: string[]): Promise<void> {
  await Promise.all(
    paths.map(path => 
      fs.unlink(path).catch(err => console.warn(`Error deleting ${path}:`, err))
    )
  );
}

function getLangNameFromCode(code: string): string {
  const langMap: Record<string, string> = {
    en: "English", es: "Spanish", fr: "French", de: "German",
    it: "Italian", pt: "Portuguese", ru: "Russian", ja: "Japanese",
    ko: "Korean", zh: "Chinese", ar: "Arabic"
  };
  return langMap[code] || code;
}