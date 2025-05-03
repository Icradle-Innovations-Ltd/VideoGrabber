import { useState, useEffect } from "react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Progress } from "./ui/progress";
import { formatFileSize } from "@/lib/utils";

interface DownloadProgressProps {
  isDownloading: boolean;
  progress: number;
  downloadedSize: number;
  totalSize: number;
  speed: number;
  onCancel: () => void;
}

export function DownloadProgress({
  isDownloading,
  progress,
  downloadedSize,
  totalSize,
  speed,
  onCancel,
}: DownloadProgressProps) {
  if (!isDownloading) return null;

  return (
    <section>
      <Card className="max-w-3xl mx-auto">
        <CardContent className="p-4 md:p-6">
          <h3 className="text-xl font-bold mb-4">Downloading...</h3>

          <div className="mb-6">
            <div className="flex justify-between mb-2">
              <span>{progress < 5 ? "Processing video..." : "Downloading..."}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2.5" />
          </div>

          <div className="flex justify-between text-sm text-accent dark:text-gray-400">
            <div>{formatFileSize(speed)}/s</div>
            <div>
              {totalSize > 0 ? (
                <>
                  {formatFileSize(downloadedSize)} / {formatFileSize(totalSize)}
                </>
              ) : (
                formatFileSize(downloadedSize)
              )}
            </div>
          </div>

          <div className="mt-6 flex justify-center">
            <Button
              variant="outline"
              onClick={onCancel}
              className="font-medium"
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
