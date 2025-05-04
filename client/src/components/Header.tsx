import { Download } from "lucide-react";

export function Header() {
  return (
    <header className="bg-white dark:bg-gray-900 shadow-sm py-4 sticky top-0 z-10">
      <div className="container mx-auto px-4 md:px-6 flex justify-between items-center">
        <div className="flex items-center">
          <Download className="h-6 w-6 text-red-600" />
          <h1 className="ml-2 text-xl font-bold">YouTube Downloader</h1>
        </div>
      </div>
    </header>
  );
}
