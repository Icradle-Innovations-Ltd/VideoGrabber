import { VideoInfo, VideoFormat, InsertVideoFormat } from "@shared/schema";

export interface IStorage {
  getCachedVideoInfo(videoId: string): Promise<VideoInfo | undefined>;
  saveVideoInfo(videoInfo: VideoInfo): Promise<void>;
  getFormatsForVideo(videoId: string): Promise<VideoFormat[]>;
  saveVideoFormat(format: InsertVideoFormat): Promise<VideoFormat>;
}

export class MemStorage implements IStorage {
  private videoInfoCache: Map<string, VideoInfo>;
  private formats: Map<string, VideoFormat[]>;
  private formatId: number;

  constructor() {
    this.videoInfoCache = new Map();
    this.formats = new Map();
    this.formatId = 1;
  }

  async getCachedVideoInfo(videoId: string): Promise<VideoInfo | undefined> {
    return this.videoInfoCache.get(videoId);
  }

  async saveVideoInfo(videoInfo: VideoInfo): Promise<void> {
    this.videoInfoCache.set(videoInfo.id, videoInfo);
  }

  async getFormatsForVideo(videoId: string): Promise<VideoFormat[]> {
    return this.formats.get(videoId) || [];
  }

  async saveVideoFormat(format: InsertVideoFormat): Promise<VideoFormat> {
    const id = this.formatId++;
    const videoFormat: VideoFormat = { ...format, id };
    
    if (!this.formats.has(format.videoId)) {
      this.formats.set(format.videoId, []);
    }
    
    this.formats.get(format.videoId)!.push(videoFormat);
    return videoFormat;
  }
}

export const storage = new MemStorage();
