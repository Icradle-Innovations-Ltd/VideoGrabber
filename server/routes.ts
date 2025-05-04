import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { videoInfoSchema, downloadOptionsSchema, playlistInfoSchema } from "@shared/schema";
import { getVideoInfo, downloadVideo, getPlaylistInfo } from "./services/youtube";
import { downloadWithOptions, getDownloadStream, validateURL } from "./services/cli-downloader";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

export async function registerRoutes(app: Express): Promise<Server> {
  // Get video information from YouTube
  app.get("/api/videos/info", async (req, res) => {
    try {
      // Allow either a videoId or a URL to be passed
      const schema = z.object({
        videoId: z.string().min(3).max(30).optional(),
        url: z.string().url().optional(),
      }).refine(data => data.videoId || data.url, {
        message: "Either videoId or url must be provided"
      });
      
      const params = schema.parse(req.query);
      
      // If URL is provided, extract video ID from it or use it directly
      if (params.url) {
        const urlObj = new URL(params.url);
        // Check if it's a YouTube URL
        if (urlObj.hostname.includes('youtube.com') || urlObj.hostname.includes('youtu.be')) {
          // Extract video ID from URL
          const videoId = urlObj.searchParams.get('v') || 
                          urlObj.pathname.split('/').pop() || '';
          
          if (videoId) {
            const videoInfo = await getVideoInfo(videoId, params.url);
            const validatedInfo = videoInfoSchema.parse(videoInfo);
            return res.json(validatedInfo);
          }
        }
        
        throw new Error("Invalid YouTube URL");
      }
      
      // If videoId is provided directly
      if (params.videoId) {
        const videoInfo = await getVideoInfo(params.videoId);
        const validatedInfo = videoInfoSchema.parse(videoInfo);
        return res.json(validatedInfo);
      }
      
      throw new Error("No video ID or URL provided");
    } catch (err) {
      const error = err as Error;
      res.status(400).json({ message: error.message || "Failed to fetch video information" });
    }
  });
  
  // Get playlist information
  app.get("/api/playlists/info", async (req, res) => {
    try {
      const { playlistId } = z.object({
        playlistId: z.string().min(1),
      }).parse(req.query);

      const playlistInfo = await getPlaylistInfo(playlistId);
      
      // Validate the structure of the response
      const validatedInfo = playlistInfoSchema.parse(playlistInfo);
      
      res.json(validatedInfo);
    } catch (err) {
      const error = err as Error;
      res.status(400).json({ message: error.message || "Failed to fetch playlist information" });
    }
  });

  // Download a video or playlist
  app.post("/api/videos/download", async (req, res) => {
    try {
      const options = downloadOptionsSchema.parse(req.body);
      
      // Set appropriate headers
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Transfer-Encoding", "chunked");
      
      // Generate filename based on whether it's a playlist or single video
      let filename;
      if (options.isPlaylist && options.playlistItems && options.playlistItems.length > 1) {
        filename = `youtube_playlist_${options.videoId}.zip`;
      } else {
        const extension = options.formatId.includes('.') ? 
          options.formatId.split('.').pop() : 
          options.formatId.split('-')[0];
        filename = `youtube_video_${options.videoId}.${extension}`;
      }
      
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      
      // Stream the video directly to the response
      const downloadStream = await downloadVideo(options);
      downloadStream.pipe(res);
      
      // Handle errors during streaming
      downloadStream.on("error", (error) => {
        console.error("Download stream error:", error);
        if (!res.headersSent) {
          res.status(500).json({ message: error.message || "Download failed: " + error.message });
        }
        res.end();
      });
    } catch (err) {
      const error = err as Error;
      res.status(400).json({ message: error.message || "Failed to download video" });
    }
  });

  // CLI Downloader routes
  
  // Start a download with CLI downloader and stream progress
  app.post("/api/cli-download/start", async (req, res) => {
    try {
      const schema = z.object({
        url: z.string().refine(url => validateURL(url), {
          message: "Invalid YouTube URL"
        }),
        downloadType: z.enum(["video", "audio", "videoOnly", "subtitles"]),
        resolution: z.string().optional(),
        audioQuality: z.string().optional(),
        subtitleLanguage: z.string().optional(),
        isPlaylist: z.boolean().optional(),
      });
      
      const options = schema.parse(req.body);
      
      // Set up SSE for progress reporting
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      
      // Send initial message
      res.write(`data: ${JSON.stringify({ progress: 0, status: "started" })}\n\n`);
      
      // Define progress callback
      const progressCallback = (progress: number, speed: string, eta: string) => {
        res.write(`data: ${JSON.stringify({ progress, speed, eta })}\n\n`);
      };
      
      // Start the download process
      try {
        const result = await downloadWithOptions(options, progressCallback);
        
        if (result.success) {
          res.write(`data: ${JSON.stringify({ 
            status: "completed", 
            progress: 100,
            outputPath: result.outputPath 
          })}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({ 
            status: "error", 
            error: result.error 
          })}\n\n`);
        }
      } catch (error) {
        res.write(`data: ${JSON.stringify({ 
          status: "error", 
          error: error.message 
        })}\n\n`);
      }
      
      // End the response
      res.end();
    } catch (err) {
      const error = err as Error;
      res.status(400).json({ message: error.message || "Failed to start download" });
    }
  });
  
  // Get list of downloaded files
  app.get("/api/cli-download/files", async (req, res) => {
    try {
      const baseDir = path.join(process.cwd(), "downloads");
      const categories = ["VideoWithAudio", "VideoOnly", "AudioOnly", "SubtitlesOnly"];
      
      const result = {};
      
      for (const category of categories) {
        const dirPath = path.join(baseDir, category);
        try {
          const files = await fs.readdir(dirPath);
          result[category] = files.map(file => ({
            name: file,
            path: path.join(category, file),
            url: `/api/cli-download/files/${category}/${encodeURIComponent(file)}`
          }));
        } catch (error) {
          result[category] = [];
        }
      }
      
      res.json(result);
    } catch (err) {
      const error = err as Error;
      res.status(500).json({ message: error.message || "Failed to list downloaded files" });
    }
  });
  
  // Download a specific file
  app.get("/api/cli-download/files/:category/:filename", async (req, res) => {
    try {
      const { category, filename } = req.params;
      
      // Validate category
      if (!["VideoWithAudio", "VideoOnly", "AudioOnly", "SubtitlesOnly"].includes(category)) {
        return res.status(400).json({ message: "Invalid category" });
      }
      
      const filePath = path.join(process.cwd(), "downloads", category, filename);
      
      try {
        const stats = await fs.stat(filePath);
        
        // Set appropriate headers
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        res.setHeader("Content-Length", stats.size);
        
        // Create read stream and pipe to response
        const fileStream = fsSync.createReadStream(filePath);
        
        fileStream.on("error", (error) => {
          console.error(`Error streaming file ${filePath}:`, error);
          if (!res.headersSent) {
            res.status(500).json({ message: "Error streaming file" });
          }
          res.end();
        });
        
        fileStream.pipe(res);
      } catch (error) {
        return res.status(404).json({ message: "File not found" });
      }
    } catch (err) {
      const error = err as Error;
      res.status(500).json({ message: error.message || "Failed to download file" });
    }
  });
  
  // Get available formats for a video
  app.get("/api/formats", async (req, res) => {
    try {
      const schema = z.object({
        url: z.string().refine(url => validateURL(url), {
          message: "Invalid YouTube URL"
        })
      });
      
      const { url } = schema.parse(req.query);
      
      // Get available formats
      const formats = await getVideoFormats(url);
      
      res.json({ formats });
    } catch (err) {
      const error = err as Error;
      res.status(400).json({ message: error.message || "Failed to get video formats" });
    }
  });
  
  // Direct download using yt-dlp with format selection
  app.post("/api/direct-download", async (req, res) => {
    try {
      const schema = z.object({
        url: z.string().refine(url => validateURL(url), {
          message: "Invalid YouTube URL"
        }),
        format: z.string().optional(), // Format ID or quality
        audioOnly: z.boolean().optional(),
        videoOnly: z.boolean().optional(),
        subtitles: z.boolean().optional(),
        subtitleLanguage: z.string().optional().default('en'),
      });
      
      const options = schema.parse(req.body);
      
      // Set up SSE for progress reporting
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });
      
      // Send initial message
      res.write(`data: ${JSON.stringify({ progress: 0, status: "started" })}\n\n`);
      
      // Determine download type and options
      let downloadType: 'video' | 'audio' | 'videoOnly' | 'subtitles';
      let additionalOptions: any = {};
      
      if (options.audioOnly) {
        downloadType = 'audio';
        additionalOptions.audioQuality = '192'; // Default high quality
      } else if (options.videoOnly) {
        downloadType = 'videoOnly';
        additionalOptions.resolution = options.format || '1080';
      } else if (options.subtitles) {
        downloadType = 'subtitles';
        additionalOptions.subtitleLanguage = options.subtitleLanguage;
      } else {
        downloadType = 'video';
        additionalOptions.resolution = options.format || '1080';
      }
      
      // Start the download
      const downloadOptions = {
        url: options.url,
        downloadType,
        ...additionalOptions
      };
      
      // Define progress callback
      const progressCallback = (progress: number, speed: string, eta: string) => {
        res.write(`data: ${JSON.stringify({ progress, speed, eta })}\n\n`);
      };
      
      try {
        const result = await downloadWithOptions(downloadOptions, progressCallback);
        
        if (result.success) {
          res.write(`data: ${JSON.stringify({ 
            status: "completed", 
            progress: 100,
            outputPath: result.outputPath 
          })}\n\n`);
        } else {
          res.write(`data: ${JSON.stringify({ 
            status: "error", 
            error: result.error 
          })}\n\n`);
        }
      } catch (error) {
        res.write(`data: ${JSON.stringify({ 
          status: "error", 
          error: error.message 
        })}\n\n`);
      }
      
      // End the response
      res.end();
    } catch (err) {
      const error = err as Error;
      res.status(400).json({ message: error.message || "Failed to start download" });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
