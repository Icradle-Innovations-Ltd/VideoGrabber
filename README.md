
# YouTube Video Downloader

A modern, feature-rich web application for downloading YouTube videos and playlists built with React, Express, and yt-dlp.

## Key Features

### Video Downloads
- Single video downloads in multiple formats
- Full playlist downloads with selection options
- Custom video trimming (start/end time)
- Multiple quality options (4K, 1080p, 720p, etc.)
- Audio-only downloads
- Subtitle downloads in multiple languages
- Real-time download progress tracking
- Download speed monitoring
- File size estimation
- Automatic format selection
- Resume interrupted downloads
- Format conversion support

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
- Drag and drop support
- Clean, modern UI

### Technical Features
- Aggressive download parameters for reliability
- Multiple fallback methods for restricted videos
- Concurrent fragment downloading
- Buffer size optimization
- Custom user agent handling
- HTTP header optimization
- Geo-bypass support
- IPv4/IPv6 support
- Cache control
- Proper error recovery

## Tech Stack

### Frontend
- React 18 with TypeScript
- TailwindCSS for styling
- Radix UI Components
- React Query for data fetching
- Custom hooks for device detection
- Toast notifications system
- Responsive layouts
- Theme management

### Backend
- Express.js with TypeScript
- yt-dlp for video processing
- Node.js 20+
- PostgreSQL with Drizzle ORM
- Zod for schema validation
- Streaming response handling
- Cache management
- Error handling middleware

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Required system dependencies:
```bash
# Install yt-dlp and ffmpeg
sudo apt-get update
sudo apt-get install yt-dlp ffmpeg
```

4. Start the development server:
```bash
npm run dev
```

## Usage

1. Paste a YouTube URL (video or playlist)
2. Select desired format and quality
3. Choose download options (trim, subtitles)
4. Click download and wait for completion

## Environment Variables

- `PORT`: Server port (default: 5000)
- `NODE_ENV`: Environment mode
- `DATABASE_URL`: PostgreSQL connection string

## API Endpoints

- `GET /api/videos/info`: Get video information
- `POST /api/videos/download`: Download video
- `GET /api/playlists/info`: Get playlist information

## Error Handling

- YouTube restrictions bypass
- Network error recovery
- Invalid URL handling
- Format availability checks
- Download interruption recovery

## Performance Optimizations

- Concurrent downloads
- Chunked transfer encoding
- Buffer size optimization
- Connection pooling
- Cache management
- Stream processing

## Deployment

The application is configured for deployment on Replit:
- Auto-scaling support
- HTTPS enabled
- Static file serving
- Database integration
- Error logging

## Development

```bash
npm run dev     # Start development server
npm run build   # Build for production
npm run lint    # Run linter
npm run test    # Run tests
```

## Directory Structure

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

## Known Limitations

1. Some videos may be restricted by YouTube
2. Regional restrictions may apply
3. Download speed depends on YouTube servers
4. Some formats may be unavailable

## Future Improvements

1. Queue system for multiple downloads
2. Format conversion options
3. Download scheduling
4. Browser extension integration
5. Custom video quality presets

## Contributing

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## License

MIT License - feel free to use and modify

