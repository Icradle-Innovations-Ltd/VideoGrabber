# YouTube Video Downloader

A modern, full-featured web application for downloading YouTube videos and playlists built with React, Express, and yt-dlp.

## Key Features

### Video Downloads
- Single video downloads in multiple formats
- Full playlist downloads with selection options
- Custom video trimming (start/end time)
- Multiple quality options (4K, 1080p, 720p, 480p, 360p, 240p, 144p.)
- Audio-only downloads in MP3 format
- Subtitle/Caption downloads in multiple languages
- Real-time download progress tracking
- File size estimation
- Format conversion support
- Automatic format selection
- Resume interrupted downloads

### Playlist Support
- Full playlist information fetching
- Selective video downloads from playlists
- Batch download capabilities
- Playlist metadata preservation
- Individual video quality selection
- Download progress for multiple files

### User Interface
- Dark/Light theme support
- Responsive design for all devices
- Real-time video preview
- Thumbnail previews
- Video metadata display
- Progress bars with speed indicators
- Error handling with friendly messages
- Toast notifications
- Clean, modern UI

## Tech Stack

### Frontend
- React 18 with TypeScript
- TailwindCSS for styling
- Radix UI Components
- React Query for data fetching
- Custom hooks for device detection
- Theme management
- Toast notifications system

### Backend
- Express.js with TypeScript
- yt-dlp for video processing
- Node.js 20+
- Zod for schema validation
- Streaming response handling
- Error handling middleware

## Quick Start

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. System dependencies (pre-installed on Replit):
- yt-dlp
- ffmpeg

4. Start the development server:
```bash
npm run dev
```

## Usage

1. Paste a YouTube URL (video or playlist)
2. Select desired format and quality
3. Choose download options:
   - Video quality
   - Audio format (MP3)
   - Subtitles/Captions
   - Trim video (optional)
4. Click download and wait for completion

## Environment

- Development port: 5000
- Automatic HTTPS in production
- Built-in error recovery
- Aggressive download parameters

## API Endpoints

- `GET /api/videos/info`: Get video information
- `POST /api/videos/download`: Download video/audio
- `GET /api/playlists/info`: Get playlist information

## Development

```bash
npm run dev     # Start development server
npm run build   # Build for production
```

## Project Structure

```
├── client/          # React frontend
│   ├── src/
│   ├── components/  # UI components
│   ├── hooks/       # Custom hooks
│   └── lib/         # Utilities
├── server/          # Express backend
│   ├── services/    # Core services
│   └── routes/      # API routes
└── shared/          # Shared types
```

## Error Handling

- YouTube restrictions bypass
- Network error recovery
- Invalid URL handling
- Format availability checks
- Download interruption recovery

## Performance Features

- Concurrent downloads
- Chunked transfer encoding
- Buffer size optimization
- Stream processing
- Cache management

## Future Improvements

1. Queue system for multiple downloads
2. Advanced format conversion options
3. Download scheduling
4. Custom video quality presets
5. Download speed optimization

## License

MIT License
