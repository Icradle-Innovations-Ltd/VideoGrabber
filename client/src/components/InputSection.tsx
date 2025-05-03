import { useState, useRef, useEffect } from "react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { CheckCircle, ListVideo, Youtube } from "lucide-react";
import { isValidYouTubeUrl, isPlaylistUrl } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "./ui/badge";

interface InputSectionProps {
  onFetchVideo: (url: string) => void;
  isLoading: boolean;
}

export function InputSection({ onFetchVideo, isLoading }: InputSectionProps) {
  const [url, setUrl] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isValid, setIsValid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const [isPlaylistDetected, setIsPlaylistDetected] = useState(false);

  useEffect(() => {
    // Validate URL as user types
    const valid = isValidYouTubeUrl(url);
    setIsValid(valid);
    
    // Check if it's a playlist
    if (valid) {
      setIsPlaylistDetected(isPlaylistUrl(url));
    } else {
      setIsPlaylistDetected(false);
    }
  }, [url]);

  // Handle clipboard paste
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (document.activeElement !== inputRef.current) {
        try {
          const clipboardData = e.clipboardData || (window as any).clipboardData;
          const pastedText = clipboardData.getData("text");
          
          if (isValidYouTubeUrl(pastedText)) {
            setUrl(pastedText);
            setIsValid(true);
            
            // Show a notification about what was detected
            const isPlaylist = isPlaylistUrl(pastedText);
            setIsPlaylistDetected(isPlaylist);
            
            toast({
              title: isPlaylist ? "Playlist Detected" : "Video URL Detected",
              description: isPlaylist 
                ? "We detected a YouTube playlist URL from your clipboard" 
                : "We detected a YouTube video URL from your clipboard",
            });
          }
        } catch (error) {
          console.error("Clipboard access error:", error);
        }
      }
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, []);

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedText = e.dataTransfer.getData("text");
    if (isValidYouTubeUrl(droppedText)) {
      setUrl(droppedText);
      setIsValid(true);
      
      // Check if it's a playlist URL
      const isPlaylist = isPlaylistUrl(droppedText);
      setIsPlaylistDetected(isPlaylist);
      
      // Show a toast notification
      toast({
        title: isPlaylist ? "Playlist URL Detected" : "Video URL Detected",
        description: isPlaylist 
          ? "We detected a YouTube playlist in the dropped URL" 
          : "Valid YouTube URL detected",
      });
    } else {
      toast({
        title: "Invalid URL",
        description: "Please drop a valid YouTube URL",
        variant: "destructive",
      });
    }
  };

  const handleFetchVideo = () => {
    if (!url) {
      toast({
        title: "Empty URL",
        description: "Please enter a YouTube URL",
        variant: "destructive",
      });
      return;
    }

    if (!isValid) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid YouTube URL",
        variant: "destructive",
      });
      return;
    }

    onFetchVideo(url);
  };

  return (
    <section className="mb-8">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold mb-2">Download YouTube Videos</h2>
        <p className="text-accent dark:text-gray-400">
          Paste a YouTube URL to download videos for free
        </p>
      </div>

      <Card 
        ref={dropAreaRef}
        className={`max-w-3xl mx-auto ${
          isDragging ? "border-2 border-dashed border-primary bg-primary/5" : ""
        }`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <CardContent className="p-4 md:p-6">
          <div className="flex flex-col md:flex-row space-y-3 md:space-y-0 md:space-x-3">
            <div className="flex-grow relative">
              <Input
                ref={inputRef}
                type="text"
                placeholder="Paste YouTube URL here (e.g., https://www.youtube.com/watch?v=...)"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="pl-10 py-6 h-auto"
              />
              {isValid && (
                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                </div>
              )}
              
              {isValid && isPlaylistDetected && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Badge variant="secondary" className="flex items-center gap-1 bg-primary/10 text-primary">
                    <ListVideo className="h-3 w-3" />
                    <span>Playlist</span>
                  </Badge>
                </div>
              )}
            </div>
            <Button 
              onClick={handleFetchVideo} 
              disabled={isLoading}
              className="py-6 px-6 h-auto whitespace-nowrap"
            >
              {isLoading ? "Loading..." : (
                <span className="flex items-center gap-1">
                  {isPlaylistDetected ? (
                    <>
                      <ListVideo className="h-4 w-4" />
                      Get Playlist
                    </>
                  ) : (
                    <>
                      <Youtube className="h-4 w-4" />
                      Get Video
                    </>
                  )}
                </span>
              )}
            </Button>
          </div>

          <div className="mt-4 text-center text-sm text-accent dark:text-gray-400">
            Or drag and drop a YouTube link here
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
