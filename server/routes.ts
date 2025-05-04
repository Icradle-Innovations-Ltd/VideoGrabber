import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { videoInfoSchema, downloadOptionsSchema, playlistInfoSchema } from "@shared/schema";
import { getVideoInfo, downloadVideo, getPlaylistInfo } from "./services/youtube";

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

  const httpServer = createServer(app);

  return httpServer;
}
