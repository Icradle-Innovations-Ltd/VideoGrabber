
import { Download, Github, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header() {
  return (
    <header className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm border-b border-border/40 py-3 sticky top-0 z-10">
      <div className="container mx-auto px-4 md:px-6 flex justify-between items-center max-w-7xl">
        <div className="flex items-center gap-2">
          <Download className="h-5 w-5 sm:h-6 sm:w-6 text-red-600" />
          <h1 className="text-lg sm:text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-red-500 to-red-600">
            YouTube Downloader
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="hidden sm:flex">
            <Github className="h-5 w-5 mr-1" />
            Star
          </Button>
          <Button variant="ghost" size="sm">
            <Moon className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  );
}
