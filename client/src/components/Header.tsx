
import { Download, Github, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/ui/theme-provider";

export function Header() {
  const { theme, setTheme } = useTheme();
  
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
          <Button variant="ghost" size="sm" className="hidden sm:flex" asChild>
            <a href="https://github.com/yourusername/youtube-downloader" target="_blank" rel="noopener noreferrer">
              <Github className="h-5 w-5 mr-1" />
              Star
            </a>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
        </div>
      </div>
    </header>
  );
}
