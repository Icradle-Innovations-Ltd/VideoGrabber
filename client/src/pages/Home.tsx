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

export default function Home() {
  const [videoInfo, setVideoInfo] = useState(null);
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

  // Mutation for fetching video info
  const fetchVideoMutation = useMutation({
    mutationFn: async (url: string) => {
      const videoId = extractVideoId(url);
      if (!videoId) {
        throw new Error("Invalid YouTube URL");
      }
      
      const response = await apiRequest("GET", `/api/videos/info?videoId=${videoId}`, undefined);
      return response.json();
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
    onSuccess: () => {
      setDownloadProgress({
        isDownloading: false,
        progress: 0,
        downloadedSize: 0,
        totalSize: 0,
        speed: 0,
      });
      toast({
        title: "Download Complete",
        description: "Your video has been downloaded successfully!",
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

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-grow container mx-auto px-4 md:px-6 py-8">
        <InputSection 
          onFetchVideo={handleFetchVideo} 
          isLoading={fetchVideoMutation.isPending} 
        />
        
        <VideoPreview 
          videoInfo={videoInfo} 
          isLoading={fetchVideoMutation.isPending}
          onDownload={handleDownload}
        />
        
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
