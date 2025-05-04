// TypeScript CLI-based YouTube Downloader (MP4, MP3, Subtitles)
import readline from 'readline';
import { execSync, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

const BASE_DIR = path.join(__dirname, 'Downloads');
const PATHS = {
  full: path.join(BASE_DIR, 'VideoWithAudio'),
  video: path.join(BASE_DIR, 'VideoOnly'),
  audio: path.join(BASE_DIR, 'AudioOnly'),
  subs: path.join(BASE_DIR, 'SubtitlesOnly')
};

const FFMPEG_PATH = path.join(__dirname, 'ffmpeg', 'bin', 'ffmpeg.exe');
const YTDLP_PATH = path.join(__dirname, 'yt-dlp.exe');
const LOG_FILE = path.join(__dirname, `download_log_${new Date().toISOString().replace(/[:.]/g, '-')}.log`);
const CONFIG_PATH = path.join(__dirname, 'ytdl_config.json');
const DEFAULT_CONFIG = {
  DefaultResolution: '1080',
  DefaultAudioQuality: '192',
  MaxConcurrentFragments: 16,
  SubtitleLanguage: 'en'
};

function writeLog(message: string, color: string = '\x1b[37m') {
  const timestamp = new Date().toISOString();
  console.log(`${color}${timestamp} - ${message}\x1b[0m`);
  fs.appendFileSync(LOG_FILE, `${timestamp} - ${message}\n`);
}

function ensureDirectories() {
  Object.values(PATHS).forEach((dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  });
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function validateURL(url: string): boolean {
  return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/.test(url);
}

function runYtDlp(args: string[]) {
  writeLog(`Running yt-dlp with args: ${args.join(' ')}`, '\x1b[36m');
  const result = spawnSync(YTDLP_PATH, args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('yt-dlp command failed');
}

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => { rl.close(); resolve(ans); }));
}

async function main() {
  console.clear();
  writeLog('YouTube Downloader (TS Edition)', '\x1b[32m');
  ensureDirectories();
  
  if (!fs.existsSync(FFMPEG_PATH)) {
    writeLog(`ERROR: ffmpeg not found at ${FFMPEG_PATH}`, '\x1b[31m');
    process.exit(1);
  }
  
  if (!fs.existsSync(YTDLP_PATH)) {
    writeLog(`ERROR: yt-dlp not found at ${YTDLP_PATH}`, '\x1b[31m');
    process.exit(1);
  }
  
  const config = loadConfig();
  
  let url = '';
  do {
    url = await prompt('\nEnter YouTube URL: ');
    if (!validateURL(url)) writeLog('Invalid URL. Try again.', '\x1b[33m');
  } while (!validateURL(url));
  
  const playlistChoice = await prompt('Download entire playlist? (y/N): ');
  const playlistFlag = playlistChoice.toLowerCase() === 'y' ? '--yes-playlist' : '--no-playlist';
  
  writeLog('Select download option:', '\x1b[36m');
  console.log(`1. Video with Audio (MP4)\n2. Video Only (MP4)\n3. Audio Only (MP3)\n4. Subtitles Only`);
  const choice = await prompt('Enter choice (1-4): ');
  
  try {
    switch (choice) {
      case '1': {
        const res = await prompt(`Select resolution (e.g. ${config.DefaultResolution}): `) || config.DefaultResolution;
        const out = path.join(PATHS.full, '%(title)s_' + res + 'p_%(upload_date>%Y%m%d)s.%(ext)s');
        runYtDlp([
          '-f', `best[ext=mp4][height<=${res}]/bestvideo[ext=mp4][height<=${res}]+bestaudio[ext=m4a]`,
          '--merge-output-format', 'mp4', 
          '--write-sub', 
          '--write-auto-sub', 
          '--sub-lang', config.SubtitleLanguage,
          '--convert-subs', 'srt', 
          '--ffmpeg-location', FFMPEG_PATH, 
          '--concurrent-fragments', config.MaxConcurrentFragments.toString(),
          '--retries', '20', 
          '--fragment-retries', '20', 
          '--continue', 
          '--prefer-free-formats', 
          playlistFlag, 
          '-o', out, 
          url
        ]);
        break;
      }
      case '2': {
        const res = await prompt(`Select resolution (e.g. ${config.DefaultResolution}): `) || config.DefaultResolution;
        const out = path.join(PATHS.video, '%(title)s_' + res + 'p_video_%(upload_date>%Y%m%d)s.%(ext)s');
        runYtDlp([
          '-f', `bestvideo[ext=mp4][height<=${res}]`, 
          '--merge-output-format', 'mp4',
          '--write-sub', 
          '--write-auto-sub', 
          '--sub-lang', config.SubtitleLanguage, 
          '--convert-subs', 'srt',
          '--ffmpeg-location', FFMPEG_PATH,
          playlistFlag, 
          '-o', out, 
          url
        ]);
        break;
      }
      case '3': {
        const q = await prompt(`Select audio quality (128/192/256/320) [${config.DefaultAudioQuality}]: `) || config.DefaultAudioQuality;
        const qualityMap: { [key: string]: string } = { '128': '3', '192': '2', '256': '1', '320': '0' };
        const ytQuality = qualityMap[q] || '2';
        const out = path.join(PATHS.audio, '%(title)s_mp3_' + q + 'kbps_%(upload_date>%Y%m%d)s.%(ext)s');
        runYtDlp([
          '-x', 
          '--audio-format', 'mp3', 
          '--audio-quality', ytQuality,
          '--ffmpeg-location', FFMPEG_PATH,
          '--write-sub', 
          '--write-auto-sub', 
          '--sub-lang', config.SubtitleLanguage, 
          '--convert-subs', 'srt',
          playlistFlag, 
          '-o', out, 
          url
        ]);
        break;
      }
      case '4': {
        const lang = await prompt(`Subtitle language (default ${config.SubtitleLanguage}): `) || config.SubtitleLanguage;
        const out = path.join(PATHS.subs, '%(title)s_subs_%(upload_date>%Y%m%d)s.%(ext)s');
        runYtDlp([
          '--skip-download', 
          '--write-sub', 
          '--write-auto-sub', 
          '--sub-lang', lang, 
          '--convert-subs', 'srt',
          playlistFlag, 
          '-o', out, 
          url
        ]);
        break;
      }
      default:
        throw new Error('Invalid menu choice');
    }
    writeLog('Download completed successfully!', '\x1b[32m');
  } catch (err: any) {
    writeLog(`ERROR: ${err.message}`, '\x1b[31m');
  }
  
  writeLog(`Downloads saved in: ${BASE_DIR}`, '\x1b[36m');
  writeLog(`Log file: ${LOG_FILE}`, '\x1b[36m');
}

main();