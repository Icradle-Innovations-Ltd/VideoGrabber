import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Loader2, CheckCircle, DownloadIcon, FileAudio, FileVideo } from "lucide-react";
import { Separator } from "./ui/separator";
import { formatTime, formatFileSize } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Format {
  formatId: string;
  extension: string;
  quality: string;
  qualityLabel?: string;
  hasAudio: boolean;
  hasVideo: boolean;
  filesize: number;
  audioChannels?: number;
}

interface VideoInfo {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  duration: number;
  channel: string;
  formats: Format[];
}

interface VideoPreviewProps {
  videoInfo: VideoInfo | null;
  isLoading: boolean;
  onDownload: (options: DownloadOptions) => void;
}

export interface DownloadOptions {
  videoId: string;
  formatId: string;
}

export function VideoPreview({ videoInfo, isLoading, onDownload }: VideoPreviewProps) {
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const { toast } = useToast();

  // Memoize format categorization to prevent unnecessary re-renders
  const categorizedFormats = useMemo(() => {
    if (!videoInfo?.formats) return {
      videoWithAudio: [],
      videoOnly: [],
      audioOnly: []
    };

    return {
      videoWithAudio: videoInfo.formats.filter(f => f.hasVideo && f.hasAudio && f.extension === 'mp4'),
      videoOnly: videoInfo.formats.filter(f => f.hasVideo && !f.hasAudio && f.extension === 'mp4'),
      audioOnly: videoInfo.formats.filter(f => !f.hasVideo && f.hasAudio && f.extension === 'mp3')
    };
  }, [videoInfo]);

  useEffect(() => {
    if (videoInfo?.formats) {
      const bestFormat = videoInfo.formats
        .filter(f => f.hasVideo && f.hasAudio)
        .sort((a, b) => (b.filesize || 0) - (a.filesize || 0))[0];
      setSelectedFormat(bestFormat?.formatId || null);
    } else {
      setSelectedFormat(null);
    }
  }, [videoInfo]);

  const handleDownload = useCallback(() => {
    if (!videoInfo || !selectedFormat) {
      toast({
        title: "Selection Error",
        description: "Please select a download format",
        variant: "destructive",
      });
      return;
    }

    try {
      onDownload({
        videoId: videoInfo.id,
        formatId: selectedFormat,
      });
      toast({
        title: "Download Started",
        description: "Your download has been initiated",
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "An error occurred while starting the download",
        variant: "destructive",
      });
    }
  }, [videoInfo, selectedFormat, onDownload, toast]);

  const getFormatIcon = (format: Format) => {
    return format.hasVideo ? (
      <FileVideo className="h-5 w-5 mr-2" aria-hidden="true" />
    ) : (
      <FileAudio className="h-5 w-5 mr-2" aria-hidden="true" />
    );
  };

  const renderFormatSection = (title: string, formats: Format[]) => (
    <div>
      <h5 className="text-sm font-medium mb-2 text-gray-500 dark:text-gray-400">{title}</h5>
      {formats.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {formats.map(format => (
            <button
              key={format.formatId}
              type="button"
              className={`border dark:border-gray-700 rounded-md p-3 text-left hover:border-primary dark:hover:border-primary transition-colors ${
                selectedFormat === format.formatId
                  ? "border-primary bg-primary/5 dark:bg-primary/10"
                  : ""
              }`}
              onClick={async () => {
                setSelectedFormat(format.formatId);
                try {
                  if (!videoInfo) return;
                  
                  const response = await fetch('/api/videos/download', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      videoId: videoInfo.id,
                      formatId: format.formatId,
                    }),
                  });

                  if (!response.ok) throw new Error('Download failed');

                  // Create a blob from the response
                  const blob = await response.blob();
                  const url = window.URL.createObjectURL(blob);
                  
                  // Create a temporary link and trigger download
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${videoInfo.title}.${format.extension}`;
                  document.body.appendChild(a);
                  a.click();
                  window.URL.revokeObjectURL(url);
                  document.body.removeChild(a);

                  toast({
                    title: "Download Started",
                    description: "Your download has been initiated",
                  });
                } catch (error) {
                  toast({
                    title: "Download Failed",
                    description: "Failed to start download. Please try again.",
                    variant: "destructive",
                  });
                }
              }}
              aria-label={`Download ${format.qualityLabel} ${title}`}
            >
              <div className="flex items-center">
                {getFormatIcon(format)}
                <div>
                  <div className="font-medium">{format.qualityLabel}</div>
                  <div className="text-xs text-accent dark:text-gray-400">
                    {formatFileSize(format.filesize)}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">No formats available</p>
      )}
    </div>
  );

  return (
    <section className="mb-4 sm:mb-8" aria-label="Video preview and download options">
      <Card className="w-full bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <CardContent className="p-3 sm:p-4 md:p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8" aria-live="polite">
              <Loader2 className="h-12 w-12 animate-spin text-primary" aria-hidden="true" />
              <p className="mt-4 text-accent dark:text-gray-400">
                Fetching video information...
              </p>
            </div>
          ) : videoInfo ? (
            <div className="flex flex-col md:flex-row gap-6">
              <div className="md:w-2/5 relative">
                <img
                  src={videoInfo.thumbnailUrl}
                  alt={`${videoInfo.title} thumbnail`}
                  className="w-full h-auto rounded-lg object-cover"
                  loading="lazy"
                />
                <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-xs">
                  <span>{formatTime(videoInfo.duration)}</span>
                </div>
              </div>

              <div className="md:w-3/5">
                <h3 className="text-xl font-bold mb-2 line-clamp-2">
                  {videoInfo.title}
                </h3>

                <div className="flex items-center mb-4">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="mr-1 text-accent dark:text-gray-400"
                    aria-hidden="true"
                  >
                    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span className="text-accent dark:text-gray-400">
                    {videoInfo.channel}
                  </span>
                </div>

                <div className="space-y-6">
                  {renderFormatSection("Video with Audio (MP4)", categorizedFormats.videoWithAudio)}
                  {renderFormatSection("Video Only (MP4)", categorizedFormats.videoOnly)}
                  {renderFormatSection("Audio Only (MP3)", categorizedFormats.audioOnly)}

                  <div className="pt-4">
                    <Button
                      className="w-full"
                      onClick={handleDownload}
                      disabled={!selectedFormat}
                      aria-label="Download selected format"
                    >
                      <DownloadIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                      Download
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8" aria-live="polite">
              <p className="text-accent dark:text-gray-400">
                No video information available
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}