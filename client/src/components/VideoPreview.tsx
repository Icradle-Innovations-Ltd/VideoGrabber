import { useState, useEffect } from "react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Loader2, CheckCircle, DownloadIcon, FileAudio, FileVideo } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
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
  downloadAudio?: boolean;
  downloadCaptions?: boolean;
}

interface Subtitle {
  lang: string;
  name: string;
}

interface VideoInfo {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  duration: number;
  channel: string;
  formats: Format[];
  subtitles: Subtitle[];
}

interface VideoPreviewProps {
  videoInfo: VideoInfo | null;
  isLoading: boolean;
  onDownload: (options: DownloadOptions) => void;
}

export interface DownloadOptions {
  videoId: string;
  formatId: string;
  start?: number;
  end?: number;
  subtitle?: string;
  subtitleFormat?: string;
  isPlaylist?: boolean;
  playlistItems?: string[];
}

export function VideoPreview({ videoInfo, isLoading, onDownload }: VideoPreviewProps) {
  const [selectedFormat, setSelectedFormat] = useState<string | null>(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(100);
  const [subtitle, setSubtitle] = useState<string>("none");
  const [subtitleFormat, setSubtitleFormat] = useState<string>("srt");
  const { toast } = useToast();

  // Reset selected format when video changes
  useEffect(() => {
    if (videoInfo) {
      // Auto-select best mp4 format with video
      const bestMp4 = videoInfo.formats
        .filter(f => f.extension === "mp4" && f.hasVideo)
        .sort((a, b) => (b.filesize || 0) - (a.filesize || 0))[0];

      setSelectedFormat(bestMp4?.formatId || null);

      // Reset trim values
      setTrimStart(0);
      setTrimEnd(100);
    } else {
      setSelectedFormat(null);
    }
  }, [videoInfo]);

  if (!videoInfo && !isLoading) return null;

  const handleStartTrimChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    setTrimStart(value);
    if (value >= trimEnd) {
      setTrimEnd(Math.min(value + 1, 100));
    }
  };

  const handleEndTrimChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    setTrimEnd(value);
    if (value <= trimStart) {
      setTrimStart(Math.max(value - 1, 0));
    }
  };

  const handleDownload = () => {
    if (!videoInfo || !selectedFormat) {
      toast({
        title: "Selection error",
        description: "Please select a format first",
        variant: "destructive",
      });
      return;
    }

    const startTime = videoInfo.duration * (trimStart / 100);
    const endTime = videoInfo.duration * (trimEnd / 100);

    const options: DownloadOptions = {
      videoId: videoInfo.id,
      formatId: selectedFormat,
      start: trimStart > 0 ? startTime : undefined,
      end: trimEnd < 100 ? endTime : undefined,
      subtitle: subtitle !== "none" ? subtitle : undefined,
      subtitleFormat: subtitle !== "none" ? subtitleFormat : undefined,
    };

    onDownload(options);
  };

  const getFormatIcon = (format: Format) => {
    if (format.hasVideo) {
      return <FileVideo className="h-5 w-5 mr-2" />;
    } else {
      return <FileAudio className="h-5 w-5 mr-2" />;
    }
  };

  const getFormatLabel = (format: Format) => {
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

  return (
    <section className="mb-8">
      <Card className="max-w-3xl mx-auto">
        <CardContent className="p-4 md:p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="mt-4 text-accent dark:text-gray-400">
                Fetching video information...
              </p>
            </div>
          ) : videoInfo ? (
            <div className="flex flex-col md:flex-row gap-6">
              <div className="md:w-2/5 relative">
                <img
                  src={videoInfo.thumbnailUrl}
                  alt={videoInfo.title}
                  className="w-full h-auto rounded-lg object-cover"
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

                <div className="space-y-6">
                  <div>
                    <h5 className="text-sm font-medium mb-2 text-gray-500 dark:text-gray-400">Video with Audio</h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {videoInfo.formats
                        .filter(f => f.hasVideo && f.hasAudio)
                        .sort((a, b) => {
                          const aRes = a.qualityLabel ? parseInt(a.qualityLabel.match(/\d+/)?.[0] || '0') : 0;
                          const bRes = b.qualityLabel ? parseInt(b.qualityLabel.match(/\d+/)?.[0] || '0') : 0;
                          return bRes - aRes;
                        })
                        .map(format => (
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
                              {getFormatIcon(format)}
                              <div>
                                <div className="font-medium">{getFormatLabel(format)}</div>
                                <div className="text-xs text-accent dark:text-gray-400">
                                  {formatFileSize(format.filesize)}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>

                    {/* Video Only */}
                    <div>
                      <h5 className="text-sm font-medium mb-2 text-gray-500 dark:text-gray-400">Video Only (MP4)</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {videoInfo.formats
                          .filter(f => f.hasVideo && !f.hasAudio && f.extension === 'mp4')
                          .sort((a, b) => {
                            const aRes = a.qualityLabel ? parseInt(a.qualityLabel.match(/\d+/)?.[0] || '0') : 0;
                            const bRes = b.qualityLabel ? parseInt(b.qualityLabel.match(/\d+/)?.[0] || '0') : 0;
                            return bRes - aRes;
                          })
                          .map(format => (
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
                                {getFormatIcon(format)}
                                <div>
                                  <div className="font-medium">{getFormatLabel(format)}</div>
                                  <div className="text-xs text-accent dark:text-gray-400">
                                    {formatFileSize(format.filesize)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>

                    {/* Audio Only */}
                    <div>
                      <h5 className="text-sm font-medium mb-2 text-gray-500 dark:text-gray-400">Audio Only (MP3)</h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {videoInfo.formats
                          .filter(f => !f.hasVideo && f.hasAudio && f.extension === 'mp3')
                          .sort((a, b) => b.filesize - a.filesize)
                          .map(format => (
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
                                {getFormatIcon(format)}
                                <div>
                                  <div className="font-medium">{getFormatLabel(format)}</div>
                                  <div className="text-xs text-accent dark:text-gray-400">
                                    {formatFileSize(format.filesize)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>

                <div className="mt-6">
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}