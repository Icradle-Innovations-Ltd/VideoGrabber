
import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="py-6 border-t border-border/40 bg-background/50">
      <div className="container mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4 max-w-7xl">
        <p className="text-sm text-accent/80">&copy; {new Date().getFullYear()} YouTube Downloader. All rights reserved.</p>
        <div className="flex items-center gap-4 text-sm text-accent/60">
          <Link to="/terms" className="hover:text-accent">Terms</Link>
          <Link to="/privacy" className="hover:text-accent">Privacy</Link>
          <Link to="/contact" className="hover:text-accent">Contact</Link>
        </div>
      </div>
    </footer>
  );
}
