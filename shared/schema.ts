import { pgTable, text, serial, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const videoFormats = pgTable("video_formats", {
  id: serial("id").primaryKey(),
  formatId: text("format_id").notNull(),
  videoId: text("video_id").notNull(),
  extension: text("extension").notNull(),
  quality: text("quality").notNull(),
  qualityLabel: text("quality_label"),
  hasAudio: boolean("has_audio").notNull(),
  hasVideo: boolean("has_video").notNull(),
  filesize: integer("filesize").notNull(),
  audioChannels: integer("audio_channels"),
});

export const insertVideoFormatSchema = createInsertSchema(videoFormats).pick({
  formatId: true,
  videoId: true,
  extension: true,
  quality: true,
  qualityLabel: true,
  hasAudio: true,
  hasVideo: true,
  filesize: true,
  audioChannels: true,
});

export type InsertVideoFormat = z.infer<typeof insertVideoFormatSchema>;
export type VideoFormat = typeof videoFormats.$inferSelect;

export const videoInfoSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  thumbnailUrl: z.string(),
  duration: z.number(),
  channel: z.string(),
  formats: z.array(
    z.object({
      formatId: z.string(),
      extension: z.string(),
      quality: z.string(),
      qualityLabel: z.string().optional(),
      hasAudio: z.boolean(),
      hasVideo: z.boolean(),
      filesize: z.number(),
      audioChannels: z.number().optional()
    })
  ),
  subtitles: z.array(
    z.object({
      lang: z.string(),
      name: z.string()
    })
  ),
  isPlaylist: z.boolean().optional(),
  playlistItems: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      duration: z.number(),
      thumbnailUrl: z.string(),
      position: z.number()
    })
  ).optional()
});

export type VideoInfo = z.infer<typeof videoInfoSchema>;

export const downloadOptionsSchema = z.object({
  videoId: z.string(),
  formatId: z.string(),
  start: z.number().optional(),
  end: z.number().optional(),
  subtitle: z.string().optional(),
  subtitleFormat: z.string().optional(),
  downloadAudio: z.boolean().optional(),
  downloadCaptions: z.boolean().optional(),
  isPlaylist: z.boolean().optional(),
  playlistItems: z.array(z.string()).optional()
});

export const playlistInfoSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  thumbnailUrl: z.string(),
  channelTitle: z.string(),
  videos: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      duration: z.number(),
      thumbnailUrl: z.string(),
      position: z.number()
    })
  )
});

export type PlaylistInfo = z.infer<typeof playlistInfoSchema>;

export type DownloadOptions = z.infer<typeof downloadOptionsSchema>;
