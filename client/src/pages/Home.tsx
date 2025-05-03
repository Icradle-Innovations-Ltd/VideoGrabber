import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { extractVideoId, extractPlaylistId, parseYouTubeInput, isPlaylistUrl } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

import { Header } from "@/components/Header";
import { InputSection } from "@/components/InputSection";
import { VideoPreview, DownloadOptions } from "@/components/VideoPreview";
import { PlaylistPreview } from "@/components/PlaylistPreview";
import { DownloadProgress } from "@/components/DownloadProgress";
import { ErrorMessage } from "@/components/ErrorMessage";
import { Footer } from "@/components/Footer";

// Define extended VideoInfo type that includes playlist properties
interface PlaylistItem {
  id: string;
  title: string;
  duration: number;
  thumbnailUrl: string;
  position: number;
}

interface ExtendedVideoInfo {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  duration: number;
  channel: string;
  formats: Array<{
    formatId: string;
    extension: string;
    quality: string;
    qualityLabel?: string;
    hasAudio: boolean;
    hasVideo: boolean;
    filesize: number;
    audioChannels?: number;
  }>;
  subtitles: Array<{
    lang: string;
    name: string;
  }>;
  isPlaylist?: boolean;
  playlistItems?: PlaylistItem[];
}

export default function Home() {
  const [videoInfo, setVideoInfo] = useState<ExtendedVideoInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [showError, setShowError] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState({
    isDownloading: false,
    progress: 0,
    downloadedSize: 0,
    totalSize: 0,
    speed: 0,
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Mutation for fetching video or playlist info
  const fetchVideoMutation = useMutation<ExtendedVideoInfo, Error, string>({
    mutationFn: async (url: string): Promise<ExtendedVideoInfo> => {
      // First determine if it's a video or playlist URL
      const urlType = parseYouTubeInput(url);
      
      if (urlType.type === 'unknown' || !urlType.id) {
        throw new Error("Invalid YouTube URL");
      }
      
      if (urlType.type === 'video') {
        // It's a video - fetch video info
        const response = await apiRequest("GET", `/api/videos/info?videoId=${urlType.id}`, undefined);
        return response.json();
      } else if (urlType.type === 'playlist') {
        // It's a playlist - first check if there's a video in the URL too
        const videoId = extractVideoId(url);
        
        if (videoId) {
          // It's a video in a playlist - fetch video info with playlist context
          const response = await apiRequest("GET", `/api/videos/info?url=${encodeURIComponent(url)}`, undefined);
          return response.json();
        } else {
          // It's just a playlist - fetch playlist info
          const response = await apiRequest("GET", `/api/playlists/info?playlistId=${urlType.id}`, undefined);
          return response.json();
        }
      }
      
      throw new Error("Could not process YouTube URL");
    },
    onSuccess: (data) => {
      setVideoInfo(data);
      setShowError(false);
    },
    onError: (error: Error) => {
      setErrorMessage(error.message || "Failed to fetch video information");
      setShowError(true);
      toast({
        title: "Error",
        description: error.message || "Failed to fetch video information",
        variant: "destructive",
      });
    },
  });

  // Mutation for downloading video
  const downloadMutation = useMutation({
    mutationFn: async (options: DownloadOptions) => {
      setDownloadProgress({
        isDownloading: true,
        progress: 0,
        downloadedSize: 0,
        totalSize: 0,
        speed: 0,
      });
      
      // Start the download
      const response = await apiRequest("POST", "/api/videos/download", options);
      
      // Get the filename from the Content-Disposition header
      const contentDisposition = response.headers.get("Content-Disposition");
      const filename = contentDisposition
        ? contentDisposition.split("filename=")[1].replace(/"/g, "")
        : `youtube_video_${options.videoId}.${options.formatId.split("-")[0]}`;
      
      // Get response size
      const contentLength = response.headers.get("Content-Length");
      const totalSize = contentLength ? parseInt(contentLength, 10) : 0;
      
      // Set up a reader to track download progress
      const reader = response.body!.getReader();
      let receivedLength = 0;
      let chunks = [];
      let lastTimestamp = Date.now();
      let lastReceivedLength = 0;
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }
        
        chunks.push(value);
        receivedLength += value.length;
        
        // Calculate progress
        const progress = totalSize ? (receivedLength / totalSize) * 100 : 0;
        
        // Calculate speed
        const now = Date.now();
        const timeElapsed = (now - lastTimestamp) / 1000; // in seconds
        
        if (timeElapsed > 0.5) { // Update every 500ms
          const bytesPerSecond = (receivedLength - lastReceivedLength) / timeElapsed;
          lastTimestamp = now;
          lastReceivedLength = receivedLength;
          
          setDownloadProgress({
            isDownloading: true,
            progress: progress,
            downloadedSize: receivedLength,
            totalSize: totalSize,
            speed: bytesPerSecond,
          });
        }
      }
      
      // Concatenate chunks into a single Uint8Array
      const chunksAll = new Uint8Array(receivedLength);
      let position = 0;
      for (const chunk of chunks) {
        chunksAll.set(chunk, position);
        position += chunk.length;
      }
      
      // Create a blob and download
      const blob = new Blob([chunksAll]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      return { success: true };
    },
    onSuccess: (data, variables) => {
      setDownloadProgress({
        isDownloading: false,
        progress: 0,
        downloadedSize: 0,
        totalSize: 0,
        speed: 0,
      });
      
      // Customize success message based on download type
      const isPlaylistDownload = variables.isPlaylist && variables.playlistItems && variables.playlistItems.length > 1;
      
      toast({
        title: "Download Complete",
        description: isPlaylistDownload 
          ? `Your playlist has been downloaded successfully!` 
          : "Your video has been downloaded successfully!",
      });
    },
    onError: (error: Error) => {
      setDownloadProgress({
        isDownloading: false,
        progress: 0,
        downloadedSize: 0,
        totalSize: 0,
        speed: 0,
      });
      setErrorMessage(error.message || "Failed to download video");
      setShowError(true);
      toast({
        title: "Download Error",
        description: error.message || "Failed to download video",
        variant: "destructive",
      });
    },
  });

  const handleFetchVideo = (url: string) => {
    fetchVideoMutation.mutate(url);
  };

  const handleDownload = (options: DownloadOptions) => {
    downloadMutation.mutate(options);
  };

  const handleCancelDownload = () => {
    downloadMutation.reset();
    setDownloadProgress({
      isDownloading: false,
      progress: 0,
      downloadedSize: 0,
      totalSize: 0,
      speed: 0,
    });
  };

  const handleDismissError = () => {
    setShowError(false);
  };

  // Determine if we should show the playlist preview
  const shouldShowPlaylist = videoInfo?.isPlaylist && 
                            videoInfo?.playlistItems && 
                            videoInfo.playlistItems.length > 0;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-grow container mx-auto px-4 md:px-6 py-8">
        <InputSection 
          onFetchVideo={handleFetchVideo} 
          isLoading={fetchVideoMutation.isPending} 
        />
        
        {/* Show Video Preview for single videos */}
        {!shouldShowPlaylist && (
          <VideoPreview 
            videoInfo={videoInfo} 
            isLoading={fetchVideoMutation.isPending}
            onDownload={handleDownload}
          />
        )}
        
        {/* Show Playlist Preview for playlists */}
        {shouldShowPlaylist && (
          <PlaylistPreview
            videoInfo={videoInfo}
            isLoading={fetchVideoMutation.isPending}
            onDownload={handleDownload}
          />
        )}
        
        <DownloadProgress 
          isDownloading={downloadProgress.isDownloading}
          progress={downloadProgress.progress}
          downloadedSize={downloadProgress.downloadedSize}
          totalSize={downloadProgress.totalSize}
          speed={downloadProgress.speed}
          onCancel={handleCancelDownload}
        />
        
        <ErrorMessage 
          message={errorMessage} 
          onDismiss={handleDismissError}
          visible={showError}
        />
      </main>
      
      <Footer />
    </div>
  );
}
