import { useTheme } from "./ui/theme-provider";
import { Button } from "./ui/button";
import { MoonIcon, SunIcon, Download } from "lucide-react";

export function Header() {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  return (
    <header className="bg-white dark:bg-gray-900 shadow-sm py-4 sticky top-0 z-10">
      <div className="container mx-auto px-4 md:px-6 flex justify-between items-center">
        <div className="flex items-center">
          <Download className="h-6 w-6 text-red-600" />
          <h1 className="ml-2 text-xl font-bold">YouTube Downloader</h1>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm hidden md:inline">
            {theme === "dark" ? "Dark Mode" : "Light Mode"}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleTheme}
            className="rounded-full h-9 w-9 p-0"
          >
            {theme === "light" ? (
              <MoonIcon className="h-5 w-5" />
            ) : (
              <SunIcon className="h-5 w-5" />
            )}
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
