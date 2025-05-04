
import { Link } from "wouter";
import { Github, Facebook, Twitter, LinkedinIcon } from "lucide-react";
import { TiktokIcon } from "./icons/TiktokIcon";
import { Button } from "./ui/button";

export function Footer() {
  return (
    <footer className="py-6 border-t border-border/40 bg-background/50">
      <div className="container mx-auto px-4 flex flex-col gap-4 max-w-7xl">
        <div className="flex flex-col sm:flex-row justify-between items-center">
          <p className="text-sm text-accent/80">&copy; {new Date().getFullYear()} YouTube Downloader. All rights reserved.</p>
          <div className="flex items-center gap-4 text-sm text-accent/60">
            <Link href="/terms" className="hover:text-accent">Terms</Link>
            <Link href="/privacy" className="hover:text-accent">Privacy</Link>
            <Link href="/contact" className="hover:text-accent">Contact</Link>
          </div>
        </div>
        
        <div className="flex justify-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <a href="https://github.com/Icradle-Innovations-Ltd" target="_blank" rel="noopener noreferrer">
              <Github className="h-5 w-5" />
              <span className="sr-only">GitHub</span>
            </a>
          </Button>
          <Button variant="ghost" size="icon" asChild>
            <a href="https://linkedin.com/company/icradle-innovations" target="_blank" rel="noopener noreferrer">
              <LinkedinIcon className="h-5 w-5" />
              <span className="sr-only">LinkedIn</span>
            </a>
          </Button>
          <Button variant="ghost" size="icon" asChild>
            <a href="https://facebook.com/IcradleInnovations" target="_blank" rel="noopener noreferrer">
              <Facebook className="h-5 w-5" />
              <span className="sr-only">Facebook</span>
            </a>
          </Button>
          <Button variant="ghost" size="icon" asChild>
            <a href="https://twitter.com/IcradleInnov" target="_blank" rel="noopener noreferrer">
              <Twitter className="h-5 w-5" />
              <span className="sr-only">Twitter</span>
            </a>
          </Button>
          <Button variant="ghost" size="icon" asChild>
            <a href="https://tiktok.com/@icradleinnovations" target="_blank" rel="noopener noreferrer">
              <TiktokIcon className="h-5 w-5" />
              <span className="sr-only">TikTok</span>
            </a>
          </Button>
        </div>
      </div>
    </footer>
  );
}
