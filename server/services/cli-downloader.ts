import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { PassThrough } from 'stream';
// Use a simple in-memory cache instead of lru-cache
class SimpleCache {
  private cache: Map<string, { value: any; expires: number }> = new Map();
  private maxSize: number;
  
  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }
  
  set(key: string, value: any, ttl: number = 3600000): void {
    // Clear oldest entries if we're at capacity
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    
    this.cache.set(key, {
      value,
      expires: Date.now() + ttl
    });
  }
  
  get(key: string): any {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    
    // Check if entry has expired
    if (entry.expires < Date.now()) {
      this.cache.delete(key);
      return undefined;
    }
    
    return entry.value;
  }
  
  clear(): void {
    this.cache.clear();
  }
}

// Define download options interface
export interface CliDownloadOptions {
  url: string;
  downloadType: 'video' | 'audio' | 'videoOnly' | 'subtitles';
  resolution?: string;
  audioQuality?: string;
  subtitleLanguage?: string;
  isPlaylist?: boolean;
  outputDir?: string;
}

// Define paths
const BASE_DIR = path.join(process.cwd(), 'downloads');
const PATHS = {
  full: path.join(BASE_DIR, 'VideoWithAudio'),
  video: path.join(BASE_DIR, 'VideoOnly'),
  audio: path.join(BASE_DIR, 'AudioOnly'),
  subs: path.join(BASE_DIR, 'SubtitlesOnly')
};

// Define paths to executables
const FFMPEG_PATH = path.join(process.cwd(), 'ffmpeg', 'bin', 'ffmpeg.exe');
const YTDLP_PATH = path.join(process.cwd(), 'yt-dlp.exe');

// Log the paths to verify they're correct
console.log('FFMPEG Path:', FFMPEG_PATH);
console.log('YT-DLP Path:', YTDLP_PATH);

// Default configuration
const DEFAULT_CONFIG = {
  DefaultResolution: '1080',
  DefaultAudioQuality: '192',
  MaxConcurrentFragments: 16,
  SubtitleLanguage: 'en'
};

// Create a cache for video formats to avoid repeated calls to yt-dlp
const formatCache = new SimpleCache(100); // Store up to 100 video format results

// Ensure all download directories exist and check executables
export async function ensureDirectories() {
  // Create download directories
  for (const dir of Object.values(PATHS)) {
    await fs.mkdir(dir, { recursive: true });
  }
  
  // Check if executables exist
  try {
    await fs.access(FFMPEG_PATH);
    console.log('FFMPEG executable found at:', FFMPEG_PATH);
  } catch (error) {
    console.error('FFMPEG executable not found at:', FFMPEG_PATH);
  }
  
  try {
    await fs.access(YTDLP_PATH);
    console.log('YT-DLP executable found at:', YTDLP_PATH);
  } catch (error) {
    console.error('YT-DLP executable not found at:', YTDLP_PATH);
  }
}

// Validate YouTube URL
export function validateURL(url: string): boolean {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url);
}

// Get available video formats with caching
export async function getVideoFormats(url: string): Promise<string[]> {
  // Check cache first
  const cachedFormats = formatCache.get(url);
  if (cachedFormats) {
    console.log('Using cached formats for:', url);
    return JSON.parse(cachedFormats);
  }
  
  console.log('Fetching video formats for:', url);
  
  return new Promise((resolve) => {
    const args = [
      '--list-formats',
      '--no-warnings',
      '--no-check-certificates',
      '--force-ipv4',
      url
    ];
    
    const ytdlp = spawn(YTDLP_PATH, args);
    let outputData = '';
    
    ytdlp.stdout.on('data', (data) => {
      outputData += data.toString();
    });
    
    ytdlp.on('close', (code) => {
      if (code === 0) {
        // Parse the output to extract available formats
        const formats = outputData
          .split('\n')
          .filter(line => line.match(/^\d+\s+/)) // Lines starting with format ID
          .map(line => line.trim());
        
        // Cache the results
        formatCache.set(url, JSON.stringify(formats));
        
        resolve(formats);
      } else {
        console.error('Failed to get video formats:', code);
        resolve([]);
      }
    });
    
    ytdlp.on('error', (error) => {
      console.error('Error getting video formats:', error);
      resolve([]);
    });
  });
}

// Execute yt-dlp with progress reporting
export async function executeYtDlp(
  args: string[],
  progressCallback?: (progress: number, speed: string, eta: string) => void
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  return new Promise((resolve) => {
    console.log(`Executing yt-dlp with command: ${YTDLP_PATH} ${args.join(' ')}`);
    
    // Send initial progress update
    if (progressCallback) {
      progressCallback(0, "Starting download...", "Calculating...");
    }
    
    const ytdlp = spawn(YTDLP_PATH, args);
    let outputData = '';
    let errorData = '';
    let outputPath = '';
    let lastProgressUpdate = Date.now();
    
    ytdlp.stdout.on('data', (data) => {
      const output = data.toString();
      outputData += output;
      
      // Try to extract the output file path
      const fileMatch = output.match(/\[download\] Destination: (.+)/);
      if (fileMatch && fileMatch[1]) {
        outputPath = fileMatch[1];
      }
      
      // Parse progress information
      if (progressCallback) {
        // Limit progress updates to once every 500ms to reduce overhead
        const now = Date.now();
        if (now - lastProgressUpdate > 500) {
          lastProgressUpdate = now;
          
          // Try to match different progress patterns
          let progressMatch = output.match(/(\d+\.\d+)% of ~?(\d+\.\d+)(\w+) at\s+(\d+\.\d+)(\w+\/s) ETA (\d+:\d+)/);
          
          if (progressMatch) {
            const progress = parseFloat(progressMatch[1]);
            const speed = `${progressMatch[4]}${progressMatch[5]}`;
            const eta = progressMatch[6];
            progressCallback(progress, speed, eta);
          } else {
            // Try alternative progress format
            progressMatch = output.match(/(\d+\.\d+)% of ~?(\d+\.\d+)(\w+) at\s+(\d+\.\d+)(\w+\/s)/);
            if (progressMatch) {
              const progress = parseFloat(progressMatch[1]);
              const speed = `${progressMatch[4]}${progressMatch[5]}`;
              progressCallback(progress, speed, "Calculating...");
            }
          }
        }
      }
    });
    
    ytdlp.stderr.on('data', (data) => {
      const error = data.toString();
      errorData += error;
      console.warn(`yt-dlp stderr: ${error}`);
    });
    
    ytdlp.on('error', (error) => {
      console.error(`Failed to start yt-dlp: ${error.message}`);
      resolve({ success: false, error: `Failed to start yt-dlp: ${error.message}` });
    });
    
    ytdlp.on('close', (code) => {
      if (code === 0) {
        // Send final progress update
        if (progressCallback) {
          progressCallback(100, "Complete", "0s");
        }
        resolve({ success: true, outputPath });
      } else {
        resolve({ success: false, error: errorData || `yt-dlp exited with code ${code}` });
      }
    });
  });
}

// Main download function
export async function downloadWithOptions(
  options: CliDownloadOptions,
  progressCallback?: (progress: number, speed: string, eta: string) => void
): Promise<{ success: boolean; outputPath?: string; error?: string }> {
  if (!validateURL(options.url)) {
    return { success: false, error: 'Invalid YouTube URL' };
  }
  
  // Ensure directories exist
  await ensureDirectories();
  
  // Check if executables exist
  try {
    await fs.access(YTDLP_PATH);
    await fs.access(FFMPEG_PATH);
  } catch (error) {
    return { 
      success: false, 
      error: `Required executables not found. Please ensure yt-dlp.exe and ffmpeg are in the correct locations.` 
    };
  }
  
  // Set default values
  const resolution = options.resolution || DEFAULT_CONFIG.DefaultResolution;
  const audioQuality = options.audioQuality || DEFAULT_CONFIG.DefaultAudioQuality;
  const subtitleLanguage = options.subtitleLanguage || DEFAULT_CONFIG.SubtitleLanguage;
  const playlistFlag = options.isPlaylist ? '--yes-playlist' : '--no-playlist';
  
  // Send initial progress update
  if (progressCallback) {
    progressCallback(0, "Starting...", "Calculating...");
  }
  
  // Prepare arguments based on download type
  let args: string[] = [];
  let outputPath = '';
  
  // Common arguments for all download types
  const commonArgs = [
    '--force-ipv4',
    '--geo-bypass',
    '--no-check-certificates',
    '--no-warnings',
    '--ffmpeg-location', FFMPEG_PATH,
    '--concurrent-fragments', DEFAULT_CONFIG.MaxConcurrentFragments.toString(),
    '--retries', '20',
    '--fragment-retries', '20',
    '--continue',
    playlistFlag
  ];
  
  switch (options.downloadType) {
    case 'video': {
      outputPath = path.join(PATHS.full, '%(title)s_' + resolution + 'p_%(id)s.%(ext)s');
      args = [
        ...commonArgs,
        '-f', `best[ext=mp4][height<=${resolution}]/bestvideo[ext=mp4][height<=${resolution}]+bestaudio[ext=m4a]`,
        '--merge-output-format', 'mp4', 
        '--write-sub', 
        '--write-auto-sub', 
        '--sub-lang', subtitleLanguage,
        '--convert-subs', 'srt', 
        '-o', outputPath, 
        options.url
      ];
      break;
    }
    case 'videoOnly': {
      outputPath = path.join(PATHS.video, '%(title)s_' + resolution + 'p_video_%(id)s.%(ext)s');
      args = [
        ...commonArgs,
        '-f', `bestvideo[ext=mp4][height<=${resolution}]`, 
        '--merge-output-format', 'mp4',
        '--write-sub', 
        '--write-auto-sub', 
        '--sub-lang', subtitleLanguage, 
        '--convert-subs', 'srt',
        '-o', outputPath, 
        options.url
      ];
      break;
    }
    case 'audio': {
      const qualityMap: { [key: string]: string } = { '128': '3', '192': '2', '256': '1', '320': '0' };
      const ytQuality = qualityMap[audioQuality] || '2';
      outputPath = path.join(PATHS.audio, '%(title)s_mp3_' + audioQuality + 'kbps_%(id)s.%(ext)s');
      args = [
        ...commonArgs,
        '-x', 
        '--audio-format', 'mp3', 
        '--audio-quality', ytQuality,
        '--write-sub', 
        '--write-auto-sub', 
        '--sub-lang', subtitleLanguage, 
        '--convert-subs', 'srt',
        '-o', outputPath, 
        options.url
      ];
      break;
    }
    case 'subtitles': {
      outputPath = path.join(PATHS.subs, '%(title)s_subs_%(id)s.%(ext)s');
      args = [
        ...commonArgs,
        '--skip-download', 
        '--write-sub', 
        '--write-auto-sub', 
        '--sub-lang', subtitleLanguage, 
        '--convert-subs', 'srt',
        '-o', outputPath, 
        options.url
      ];
      break;
    }
    default:
      return { success: false, error: 'Invalid download type' };
  }
  
  // Execute the download with progress reporting
  return executeYtDlp(args, progressCallback);
}

// Function to get download progress via WebSocket
export function getDownloadStream(options: CliDownloadOptions): { 
  stream: PassThrough; 
  progressCallback: (progress: number, speed: string, eta: string) => void 
} {
  const stream = new PassThrough();
  let lastProgress = 0;
  
  const progressCallback = (progress: number, speed: string, eta: string) => {
    // Only send updates when progress changes significantly
    if (progress - lastProgress >= 1 || progress === 100) {
      lastProgress = progress;
      const progressData = JSON.stringify({ 
        progress, 
        speed, 
        eta,
        type: options.downloadType
      });
      stream.write(`data: ${progressData}\n\n`);
    }
  };
  
  return { stream, progressCallback };
}