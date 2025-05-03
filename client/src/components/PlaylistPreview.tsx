import React, { useState } from "react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Loader2, CheckCircle, DownloadIcon, FileVideo, List } from "lucide-react";
import { Separator } from "./ui/separator";
import { Checkbox } from "./ui/checkbox";
import { formatTime, formatFileSize } from "@/lib/utils";
import { ScrollArea } from "./ui/scroll-area";

// Define our own DownloadOptions type to include playlist properties
interface DownloadOptions {
  videoId: string;
  formatId: string;
  start?: number;
  end?: number;
  subtitle?: string;
  subtitleFormat?: string;
  isPlaylist?: boolean;
  playlistItems?: string[];
}

interface PlaylistItem {
  id: string;
  title: string;
  duration: number;
  thumbnailUrl: string;
  position: number;
}

interface VideoFormat {
  formatId: string;
  extension: string;
  quality: string;
  qualityLabel?: string;
  hasAudio: boolean;
  hasVideo: boolean;
  filesize: number;
  audioChannels?: number;
}

interface PlaylistPreviewProps {
  videoInfo: {
    id: string;
    title: string;
    description: string;
    thumbnailUrl: string;
    duration: number;
    channel: string;
    formats: VideoFormat[];
    playlistItems?: PlaylistItem[];
    isPlaylist: boolean;
  } | null;
  isLoading: boolean;
  onDownload: (options: DownloadOptions) => void;
}

export function PlaylistPreview({ videoInfo, isLoading, onDownload }: PlaylistPreviewProps) {
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [selectAll, setSelectAll] = useState(false);

  if (!videoInfo && !isLoading) return null;
  
  // If it's not actually a playlist or has no items, don't render playlist UI
  if (!videoInfo?.isPlaylist || !videoInfo?.playlistItems || videoInfo.playlistItems.length === 0) return null;

  const playlistItems = videoInfo.playlistItems;

  const toggleSelectAll = () => {
    if (selectAll) {
      setSelectedItems([]);
    } else {
      setSelectedItems(playlistItems.map(item => item.id));
    }
    setSelectAll(!selectAll);
  };

  const toggleVideoSelection = (videoId: string) => {
    if (selectedItems.includes(videoId)) {
      setSelectedItems(selectedItems.filter(id => id !== videoId));
      setSelectAll(false);
    } else {
      setSelectedItems([...selectedItems, videoId]);
      if (selectedItems.length + 1 === playlistItems.length) {
        setSelectAll(true);
      }
    }
  };

  const getFormatLabel = (format: VideoFormat) => {
    if (format.hasVideo && format.hasAudio) {
      // Video with audio
      return `${format.extension.toUpperCase()} - ${format.qualityLabel || format.quality} with Audio`;
    } else if (format.hasVideo) {
      // Video only
      return `${format.extension.toUpperCase()} - ${format.qualityLabel || format.quality} (Video Only)`;
    } else {
      // Audio only
      return `${format.extension.toUpperCase()} - Audio Only ${format.audioChannels ? `(${format.audioChannels}ch)` : ''}`;
    }
  };

  const handleDownload = () => {
    if (!selectedFormat || selectedItems.length === 0) return;
    
    onDownload({
      videoId: videoInfo.id,
      formatId: selectedFormat,
      isPlaylist: true,
      playlistItems: selectedItems
    });
  };

  // Automatically select best format if none is selected
  React.useEffect(() => {
    if (videoInfo && !selectedFormat) {
      // Auto-select best mp4 format with video
      const bestMp4 = videoInfo.formats
        .filter(f => f.extension === "mp4" && f.hasVideo && f.hasAudio)
        .sort((a, b) => (b.filesize || 0) - (a.filesize || 0))[0];
      
      setSelectedFormat(bestMp4?.formatId || null);
    }
  }, [videoInfo, selectedFormat]);

  return (
    <section className="mb-8">
      <Card className="max-w-3xl mx-auto">
        <CardContent className="p-4 md:p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="mt-4 text-accent dark:text-gray-400">
                Fetching playlist information...
              </p>
            </div>
          ) : videoInfo ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col md:flex-row gap-4 mb-2">
                <div className="md:w-2/5 relative">
                  <img
                    src={videoInfo.thumbnailUrl}
                    alt={videoInfo.title}
                    className="w-full h-auto rounded-lg object-cover"
                  />
                  <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white px-2 py-1 rounded text-xs">
                    <span>{playlistItems.length} videos</span>
                  </div>
                </div>

                <div className="md:w-3/5">
                  <h3 className="text-xl font-bold mb-2 line-clamp-2">
                    {videoInfo.title}
                  </h3>

                  <div className="flex items-center mb-4">
                    <span className="mr-1 text-accent dark:text-gray-400">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-user">
                        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </span>
                    <span className="text-accent dark:text-gray-400">
                      {videoInfo.channel}
                    </span>
                  </div>

                  {/* Format Selection */}
                  <div className="mb-4">
                    <h4 className="font-medium mb-2">Select Format:</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {videoInfo.formats
                        .filter(format => format.hasVideo && format.hasAudio)
                        .sort((a, b) => {
                          // Extract resolution numbers for comparison
                          const aRes = a.qualityLabel ? parseInt(a.qualityLabel.match(/\d+/)?.[0] || '0') : 0;
                          const bRes = b.qualityLabel ? parseInt(b.qualityLabel.match(/\d+/)?.[0] || '0') : 0;
                          return bRes - aRes; // Higher resolution first
                        })
                        .slice(0, 4) // Limit to top 4 formats
                        .map((format) => (
                          <div
                            key={format.formatId}
                            className={`border dark:border-gray-700 rounded-md p-3 cursor-pointer hover:border-primary dark:hover:border-primary transition-colors ${
                              selectedFormat === format.formatId
                                ? "border-primary bg-primary/5 dark:bg-primary/10"
                                : ""
                            }`}
                            onClick={() => setSelectedFormat(format.formatId)}
                          >
                            <div className="flex items-center">
                              <FileVideo className="h-5 w-5 mr-2" />
                              <div>
                                <div className="font-medium">{getFormatLabel(format)}</div>
                                <div className="text-xs text-accent dark:text-gray-400">
                                  Approx. {formatFileSize(format.filesize * selectedItems.length)}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Playlist Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">Playlist Videos ({playlistItems.length})</h4>
                  <div className="flex items-center gap-2">
                    <Checkbox 
                      id="select-all" 
                      checked={selectAll}
                      onCheckedChange={toggleSelectAll}
                    />
                    <label htmlFor="select-all" className="text-sm cursor-pointer">
                      Select All
                    </label>
                  </div>
                </div>
                
                <ScrollArea className="h-[300px] border rounded-md p-2">
                  <div className="space-y-2">
                    {playlistItems.map((item) => (
                      <div 
                        key={item.id} 
                        className="flex gap-3 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                      >
                        <Checkbox 
                          id={`video-${item.id}`}
                          checked={selectedItems.includes(item.id)}
                          onCheckedChange={() => toggleVideoSelection(item.id)}
                          className="mt-1"
                        />
                        <div className="flex flex-1 gap-3">
                          <div className="relative w-24 h-16 flex-shrink-0">
                            <img 
                              src={item.thumbnailUrl} 
                              alt={item.title}
                              className="w-full h-full object-cover rounded"
                            />
                            <div className="absolute bottom-1 right-1 bg-black bg-opacity-70 text-white px-1 py-0.5 rounded text-xs">
                              {formatTime(item.duration)}
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm line-clamp-2">{item.title}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              Video {item.position + 1}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <div className="mt-4">
                <Button
                  className="w-full py-6 h-auto"
                  onClick={handleDownload}
                  disabled={!selectedFormat || selectedItems.length === 0}
                >
                  <DownloadIcon className="mr-2 h-5 w-5" />
                  Download {selectedItems.length} Selected Videos
                </Button>
                <p className="text-xs text-center mt-2 text-gray-500 dark:text-gray-400">
                  {selectedItems.length > 0 
                    ? `Selected ${selectedItems.length} of ${playlistItems.length} videos` 
                    : "Select videos to download"
                  }
                </p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}