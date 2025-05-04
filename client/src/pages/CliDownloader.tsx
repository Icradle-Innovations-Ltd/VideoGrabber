import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Download, FileVideo, FileAudio, FileText, RefreshCw } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DownloadFile {
  name: string;
  path: string;
  url: string;
}

interface DownloadFiles {
  VideoWithAudio: DownloadFile[];
  VideoOnly: DownloadFile[];
  AudioOnly: DownloadFile[];
  SubtitlesOnly: DownloadFile[];
}

const CliDownloader = () => {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [downloadType, setDownloadType] = useState<"video" | "audio" | "videoOnly" | "subtitles">("video");
  const [resolution, setResolution] = useState("1080");
  const [audioQuality, setAudioQuality] = useState("192");
  const [subtitleLanguage, setSubtitleLanguage] = useState("en");
  const [isPlaylist, setIsPlaylist] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState("");
  const [eta, setEta] = useState("");
  const [files, setFiles] = useState<DownloadFiles | null>(null);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [activeTab, setActiveTab] = useState("download");

  // Fetch downloaded files
  const fetchFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const response = await fetch("/api/cli-download/files");
      if (!response.ok) throw new Error("Failed to fetch files");
      const data = await response.json();
      setFiles(data);
    } catch (error) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch downloaded files",
        variant: "destructive",
      });
    } finally {
      setIsLoadingFiles(false);
    }
  };

  // Start download
  const startDownload = async () => {
    if (!url) {
      toast({
        title: "Error",
        description: "Please enter a YouTube URL",
        variant: "destructive",
      });
      return;
    }

    setIsDownloading(true);
    setProgress(0);
    setSpeed("");
    setEta("");

    try {
      // Show initial toast
      toast({
        title: "Starting Download",
        description: "Preparing to download your content...",
      });

      // Prepare options for direct download
      const options = {
        url,
        format: downloadType === "video" || downloadType === "videoOnly" ? resolution : undefined,
        audioOnly: downloadType === "audio",
        videoOnly: downloadType === "videoOnly",
        subtitles: downloadType === "subtitles",
        subtitleLanguage,
        isPlaylist: isPlaylist || false,
      };

      // Make a POST request to start the download
      const response = await fetch('/api/cli-download/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          downloadType,
          resolution,
          audioQuality,
          subtitleLanguage,
          isPlaylist: isPlaylist || false,
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to start download: ${response.statusText}`);
      }

      // Set up event source reader
      const reader = response.body?.getReader();
      
      if (!reader) {
        throw new Error('Failed to create stream reader');
      }
      
      // Process the stream
      const processStream = async () => {
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            break;
          }
          
          // Convert the chunk to text and add to buffer
          const chunk = new TextDecoder().decode(value);
          buffer += chunk;
          
          // Process complete messages in the buffer
          const messages = buffer.split('\n\n');
          buffer = messages.pop() || ''; // Keep the last incomplete message in the buffer
          
          for (const message of messages) {
            if (message.startsWith('data: ')) {
              try {
                const data = JSON.parse(message.substring(6));
                
                if (data.progress !== undefined) {
                  setProgress(data.progress);
                }
                
                if (data.speed) {
                  setSpeed(data.speed);
                }
                
                if (data.eta) {
                  setEta(data.eta);
                }
                
                if (data.status === "completed") {
                  toast({
                    title: "Download Complete",
                    description: `File saved to ${data.outputPath}`,
                  });
                  setIsDownloading(false);
                  fetchFiles(); // Refresh file list
                  return;
                }
                
                if (data.status === "error") {
                  toast({
                    title: "Download Failed",
                    description: data.error || "An unknown error occurred",
                    variant: "destructive",
                  });
                  setIsDownloading(false);
                  return;
                }
              } catch (error) {
                console.error('Error parsing SSE message:', error);
              }
            }
          }
        }
        
        setIsDownloading(false);
      };
      
      // Start processing the stream
      processStream().catch(error => {
        console.error('Error processing stream:', error);
        toast({
          title: "Connection Error",
          description: "Lost connection to the server",
          variant: "destructive",
        });
        setIsDownloading(false);
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error.message || "Failed to start download",
        variant: "destructive",
      });
      setIsDownloading(false);
    }
  };

  // Load files on initial render and tab change
  useEffect(() => {
    if (activeTab === "files") {
      fetchFiles();
    }
  }, [activeTab]);

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-6 text-center">YouTube Downloader</h1>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="download">Download</TabsTrigger>
          <TabsTrigger value="files">Downloaded Files</TabsTrigger>
        </TabsList>
        
        <TabsContent value="download">
          <Card>
            <CardHeader>
              <CardTitle>Download YouTube Videos</CardTitle>
              <CardDescription>
                Download videos, audio, or subtitles from YouTube using yt-dlp
              </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="url">YouTube URL</Label>
                <Input
                  id="url"
                  placeholder="https://www.youtube.com/watch?v=..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isDownloading}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Download Type</Label>
                <RadioGroup
                  value={downloadType}
                  onValueChange={(value) => setDownloadType(value as any)}
                  className="flex flex-col space-y-1"
                  disabled={isDownloading}
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="video" id="video" />
                    <Label htmlFor="video" className="cursor-pointer">Video with Audio (MP4)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="videoOnly" id="videoOnly" />
                    <Label htmlFor="videoOnly" className="cursor-pointer">Video Only (MP4)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="audio" id="audio" />
                    <Label htmlFor="audio" className="cursor-pointer">Audio Only (MP3)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="subtitles" id="subtitles" />
                    <Label htmlFor="subtitles" className="cursor-pointer">Subtitles Only</Label>
                  </div>
                </RadioGroup>
              </div>
              
              {(downloadType === "video" || downloadType === "videoOnly") && (
                <div className="space-y-2">
                  <Label htmlFor="resolution">Resolution</Label>
                  <Select
                    value={resolution}
                    onValueChange={setResolution}
                    disabled={isDownloading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Resolution" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2160">4K (2160p)</SelectItem>
                      <SelectItem value="1440">2K (1440p)</SelectItem>
                      <SelectItem value="1080">Full HD (1080p)</SelectItem>
                      <SelectItem value="720">HD (720p)</SelectItem>
                      <SelectItem value="480">SD (480p)</SelectItem>
                      <SelectItem value="360">Low (360p)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {downloadType === "audio" && (
                <div className="space-y-2">
                  <Label htmlFor="audioQuality">Audio Quality</Label>
                  <Select
                    value={audioQuality}
                    onValueChange={setAudioQuality}
                    disabled={isDownloading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Audio Quality" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="320">320 kbps</SelectItem>
                      <SelectItem value="256">256 kbps</SelectItem>
                      <SelectItem value="192">192 kbps</SelectItem>
                      <SelectItem value="128">128 kbps</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {downloadType === "subtitles" && (
                <div className="space-y-2">
                  <Label htmlFor="subtitleLanguage">Subtitle Language</Label>
                  <Select
                    value={subtitleLanguage}
                    onValueChange={setSubtitleLanguage}
                    disabled={isDownloading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Language" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                      <SelectItem value="de">German</SelectItem>
                      <SelectItem value="it">Italian</SelectItem>
                      <SelectItem value="pt">Portuguese</SelectItem>
                      <SelectItem value="ru">Russian</SelectItem>
                      <SelectItem value="ja">Japanese</SelectItem>
                      <SelectItem value="ko">Korean</SelectItem>
                      <SelectItem value="zh">Chinese</SelectItem>
                      <SelectItem value="ar">Arabic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isPlaylist"
                  checked={isPlaylist}
                  onCheckedChange={(checked) => setIsPlaylist(!!checked)}
                  disabled={isDownloading}
                />
                <Label htmlFor="isPlaylist" className="cursor-pointer">
                  Download entire playlist
                </Label>
              </div>
              
              {isDownloading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progress: {progress.toFixed(1)}%</span>
                    <span>{speed ? `Speed: ${speed}` : ""}</span>
                    <span>{eta ? `ETA: ${eta}` : ""}</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                </div>
              )}
            </CardContent>
            
            <CardFooter>
              <Button
                onClick={startDownload}
                disabled={isDownloading || !url}
                className="w-full"
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Start Download
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>
        
        <TabsContent value="files">
          <Card>
            <CardHeader>
              <CardTitle>Downloaded Files</CardTitle>
              <CardDescription>
                View and download your previously downloaded files
              </CardDescription>
            </CardHeader>
            
            <CardContent>
              <div className="flex justify-end mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchFiles}
                  disabled={isLoadingFiles}
                >
                  {isLoadingFiles ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  <span className="ml-2">Refresh</span>
                </Button>
              </div>
              
              {isLoadingFiles ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : files ? (
                <Tabs defaultValue="VideoWithAudio">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="VideoWithAudio">
                      <FileVideo className="h-4 w-4 mr-2" />
                      <span className="hidden sm:inline">Videos</span>
                    </TabsTrigger>
                    <TabsTrigger value="VideoOnly">
                      <FileVideo className="h-4 w-4 mr-2" />
                      <span className="hidden sm:inline">Video Only</span>
                    </TabsTrigger>
                    <TabsTrigger value="AudioOnly">
                      <FileAudio className="h-4 w-4 mr-2" />
                      <span className="hidden sm:inline">Audio</span>
                    </TabsTrigger>
                    <TabsTrigger value="SubtitlesOnly">
                      <FileText className="h-4 w-4 mr-2" />
                      <span className="hidden sm:inline">Subtitles</span>
                    </TabsTrigger>
                  </TabsList>
                  
                  {Object.entries(files).map(([category, fileList]) => (
                    <TabsContent key={category} value={category}>
                      <ScrollArea className="h-[300px]">
                        {fileList.length === 0 ? (
                          <p className="text-center py-8 text-muted-foreground">
                            No files found in this category
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {fileList.map((file) => (
                              <div
                                key={file.path}
                                className="flex items-center justify-between p-2 rounded-md border"
                              >
                                <span className="truncate max-w-[70%]">{file.name}</span>
                                <a
                                  href={file.url}
                                  download
                                  className="flex items-center text-primary hover:underline"
                                >
                                  <Download className="h-4 w-4 mr-1" />
                                  Download
                                </a>
                              </div>
                            ))}
                          </div>
                        )}
                      </ScrollArea>
                    </TabsContent>
                  ))}
                </Tabs>
              ) : (
                <p className="text-center py-8 text-muted-foreground">
                  No files found. Download some videos first!
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CliDownloader;