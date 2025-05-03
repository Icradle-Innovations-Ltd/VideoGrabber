import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import { videoInfoSchema, downloadOptionsSchema } from "@shared/schema";
import { getVideoInfo, downloadVideo } from "./services/youtube";

export async function registerRoutes(app: Express): Promise<Server> {
  // Get video information from YouTube
  app.get("/api/videos/info", async (req, res) => {
    try {
      const { videoId } = z.object({
        videoId: z.string().min(11).max(11),
      }).parse(req.query);

      const videoInfo = await getVideoInfo(videoId);
      
      // Validate the structure of the response
      const validatedInfo = videoInfoSchema.parse(videoInfo);
      
      res.json(validatedInfo);
    } catch (err) {
      const error = err as Error;
      res.status(400).json({ message: error.message || "Failed to fetch video information" });
    }
  });

  // Download a video
  app.post("/api/videos/download", async (req, res) => {
    try {
      const options = downloadOptionsSchema.parse(req.body);
      
      // Set appropriate headers
      res.setHeader("Content-Type", "application/octet-stream");
      
      // Generate filename from video ID and format
      const extension = options.formatId.split("-")[0];
      const filename = `youtube_video_${options.videoId}.${extension}`;
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      
      // Stream the video directly to the response
      const downloadStream = await downloadVideo(options);
      downloadStream.pipe(res);
      
      // Handle errors during streaming
      downloadStream.on("error", (error) => {
        console.error("Download stream error:", error);
        if (!res.headersSent) {
          res.status(500).json({ message: "Download stream error" });
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
