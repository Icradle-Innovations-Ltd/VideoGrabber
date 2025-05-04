import fs from 'fs';
import path from 'path';
import https from 'https';
import { exec } from 'child_process';
import os from 'os';
import { fileURLToPath } from 'url';

// Get the directory name
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// URLs for dependencies
const YTDLP_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
const FFMPEG_URL = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip';

// Paths
const ROOT_DIR = __dirname;
const YTDLP_PATH = path.join(ROOT_DIR, 'yt-dlp.exe');
const FFMPEG_ZIP_PATH = path.join(ROOT_DIR, 'ffmpeg.zip');
const FFMPEG_DIR = path.join(ROOT_DIR, 'ffmpeg');

// Create downloads directory structure
const DOWNLOAD_DIRS = [
  path.join(ROOT_DIR, 'downloads'),
  path.join(ROOT_DIR, 'downloads', 'VideoWithAudio'),
  path.join(ROOT_DIR, 'downloads', 'VideoOnly'),
  path.join(ROOT_DIR, 'downloads', 'AudioOnly'),
  path.join(ROOT_DIR, 'downloads', 'SubtitlesOnly')
];

// Create download directories
function createDirectories() {
  console.log('Creating download directories...');
  DOWNLOAD_DIRS.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    } else {
      console.log(`Directory already exists: ${dir}`);
    }
  });
}

// Download a file
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url} to ${dest}...`);
    const file = fs.createWriteStream(dest);
    
    https.get(url, response => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log(`Downloaded ${dest}`);
        resolve();
      });
    }).on('error', err => {
      fs.unlink(dest, () => {}); // Delete the file on error
      reject(err);
    });
  });
}

// Extract zip file (Windows only)
function extractZip(zipPath, destDir) {
  return new Promise((resolve, reject) => {
    console.log(`Extracting ${zipPath} to ${destDir}...`);
    
    // Use PowerShell to extract the zip file
    const command = `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`;
    
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Extraction error: ${error.message}`);
        reject(error);
        return;
      }
      
      console.log('Extraction complete');
      resolve();
    });
  });
}

// Rename the extracted ffmpeg directory
function renameFFmpegDir() {
  return new Promise((resolve, reject) => {
    // Find the extracted directory (it usually has a name like ffmpeg-6.0-essentials_build)
    const files = fs.readdirSync(ROOT_DIR);
    const ffmpegExtractedDir = files.find(file => 
      file.startsWith('ffmpeg-') && 
      file.includes('essentials_build') && 
      fs.statSync(path.join(ROOT_DIR, file)).isDirectory()
    );
    
    if (!ffmpegExtractedDir) {
      console.log('FFmpeg directory not found, skipping rename');
      resolve();
      return;
    }
    
    const oldPath = path.join(ROOT_DIR, ffmpegExtractedDir);
    
    // Remove existing ffmpeg directory if it exists
    if (fs.existsSync(FFMPEG_DIR)) {
      console.log('Removing existing ffmpeg directory...');
      fs.rmSync(FFMPEG_DIR, { recursive: true, force: true });
    }
    
    // Rename the directory
    console.log(`Renaming ${oldPath} to ${FFMPEG_DIR}...`);
    fs.renameSync(oldPath, FFMPEG_DIR);
    console.log('Rename complete');
    
    resolve();
  });
}

// Clean up temporary files
function cleanup() {
  console.log('Cleaning up temporary files...');
  if (fs.existsSync(FFMPEG_ZIP_PATH)) {
    fs.unlinkSync(FFMPEG_ZIP_PATH);
    console.log(`Deleted ${FFMPEG_ZIP_PATH}`);
  }
}

// Main function
async function main() {
  try {
    console.log('Setting up dependencies for VideoGrabber...');
    
    // Create directories
    createDirectories();
    
    // Download yt-dlp.exe
    if (!fs.existsSync(YTDLP_PATH)) {
      await downloadFile(YTDLP_URL, YTDLP_PATH);
    } else {
      console.log('yt-dlp.exe already exists, skipping download');
    }
    
    // Download and extract FFmpeg (Windows only)
    if (os.platform() === 'win32') {
      if (!fs.existsSync(FFMPEG_DIR)) {
        await downloadFile(FFMPEG_URL, FFMPEG_ZIP_PATH);
        await extractZip(FFMPEG_ZIP_PATH, ROOT_DIR);
        await renameFFmpegDir();
        cleanup();
      } else {
        console.log('FFmpeg directory already exists, skipping download');
      }
    } else {
      console.log('Non-Windows platform detected. Please install FFmpeg manually.');
    }
    
    console.log('\nSetup complete! You can now run the application with:');
    console.log('npm run dev');
  } catch (error) {
    console.error('Error during setup:', error);
    process.exit(1);
  }
}

// Run the main function
main();