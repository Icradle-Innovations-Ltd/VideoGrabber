
# YouTube Video Downloader

A modern web application for downloading YouTube videos built with React, Express, and yt-dlp.

## Features

- Download single YouTube videos
- Multiple quality options support 
- Dark/Light theme
- Playlist download support
- Real-time download progress
- Responsive design

## Tech Stack

### Frontend
- React 18
- TypeScript
- TailwindCSS
- Radix UI Components
- React Query
- Wouter (Routing)

### Backend
- Express.js
- yt-dlp
- Node.js 20
- TypeScript
- Zod (Schema validation)

## Common Issues & Solutions

1. **Download Size Issues**
   - Problem: Downloads showing incorrect file sizes or tiny files
   - Solution: Updated download parameters for better buffering and throttling:
     - Increased buffer size to 16M
     - Added concurrent fragment downloading
     - Implemented aria2c downloader
     - Added aggressive headers and caching control

2. **YouTube Restrictions**
   - Problem: YouTube blocking downloads with 403 errors
   - Solution: Implemented multiple fallback strategies:
     - Updated user agents
     - Added multiple request headers
     - Implemented retry logic
     - Added geo-bypass options

3. **Download Progress**
   - Problem: Inconsistent progress tracking
   - Solution: Added chunked transfer encoding and better stream handling

## Development Setup

1. Install Dependencies:
```bash
npm install
```

2. Required System Dependencies:
- yt-dlp
- ffmpeg

3. Start Development Server:
```bash
npm run dev
```

## Environment

The application runs on Replit with:
- Port 5000 for development
- Production deployment via Replit deployment system
- PostgreSQL 16 for data persistence
- Automatic HTTPS in production

## Architecture

```
├── client/          # React frontend
├── server/          # Express backend
│   ├── services/    # Core services
│   └── routes/      # API routes
└── shared/          # Shared types/schemas
```

## Best Practices

1. Use TypeScript for type safety
2. Implement proper error handling
3. Follow RESTful API design
4. Use Zod for runtime type validation
5. Implement proper file cleanup
6. Handle large file downloads efficiently

## Deployment

The application is configured for deployment on Replit:
- Auto-scales based on load
- Handles HTTPS automatically
- Proper build pipeline setup
- Environment variable management

## Known Limitations

1. Some videos may be restricted by YouTube's policies
2. Large playlist downloads may take longer
3. Some formats might not be available for certain videos

## Future Improvements

1. Add download queue system
2. Implement better error recovery
3. Add more format conversion options
4. Improve playlist handling
5. Add download resume capability

