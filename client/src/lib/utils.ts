import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Validate YouTube URL
export function isValidYouTubeUrl(url: string): boolean {
  // Match either video or playlist URLs
  const videoPattern = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const playlistPattern = /^(https?:\/\/)?(www\.)?youtube\.com\/(playlist\?list=|watch\?v=[a-zA-Z0-9_-]{11}&list=)([a-zA-Z0-9_-]+)/;
  
  return videoPattern.test(url) || playlistPattern.test(url);
}

// Extract video ID from YouTube URL
export function extractVideoId(url: string): string | null {
  const pattern = /^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|embed\/|shorts\/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?]*).*/;
  const match = url.match(pattern);
  return match ? match[1] : null;
}

// Extract playlist ID from YouTube URL
export function extractPlaylistId(url: string): string | null {
  // Match list parameter in any YouTube URL
  const pattern = /[&?]list=([a-zA-Z0-9_-]+)/;
  const match = url.match(pattern);
  return match ? match[1] : null;
}

// Check if URL is a YouTube playlist
export function isPlaylistUrl(url: string): boolean {
  return !!extractPlaylistId(url);
}

// Detect if input is a valid YouTube URL or Video ID
export function parseYouTubeInput(input: string): { type: 'video' | 'playlist' | 'unknown', id: string | null } {
  // Check if it's a direct video ID (11 characters)
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
    return { type: 'video', id: input };
  }
  
  // Check if it's a URL
  if (isValidYouTubeUrl(input)) {
    const playlistId = extractPlaylistId(input);
    if (playlistId) {
      // It's a playlist URL (might also contain a video)
      return { type: 'playlist', id: playlistId };
    }
    
    const videoId = extractVideoId(input);
    if (videoId) {
      // It's a video URL
      return { type: 'video', id: videoId };
    }
  }
  
  return { type: 'unknown', id: null };
}

// Format time from seconds to MM:SS
export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}
