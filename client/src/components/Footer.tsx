export function Footer() {
  return (
    <footer className="bg-muted dark:bg-card py-6 mt-8">
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <p className="text-accent dark:text-gray-400 text-sm mb-4 md:mb-0">
            This tool is for personal use only. Please respect copyright laws.
          </p>
          <div className="flex space-x-4">
            <a
              href="#"
              className="text-accent dark:text-gray-400 hover:text-foreground dark:hover:text-white transition-colors"
            >
              Terms
            </a>
            <a
              href="#"
              className="text-accent dark:text-gray-400 hover:text-foreground dark:hover:text-white transition-colors"
            >
              Privacy
            </a>
            <a
              href="#"
              className="text-accent dark:text-gray-400 hover:text-foreground dark:hover:text-white transition-colors"
            >
              Contact
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
