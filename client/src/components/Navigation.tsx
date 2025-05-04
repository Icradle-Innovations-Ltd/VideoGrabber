
import { Link } from "wouter";

export default function Navigation() {
  return (
    <nav className="bg-background border-b mb-8">
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <Link href="/">
            <span className="text-xl font-bold hover:text-primary cursor-pointer">YouTube Downloader</span>
          </Link>
          <div className="flex gap-4">
            <Link href="/terms">
              <span className="hover:text-primary cursor-pointer">Terms</span>
            </Link>
            <Link href="/privacy">
              <span className="hover:text-primary cursor-pointer">Privacy</span>
            </Link>
            <Link href="/contact">
              <span className="hover:text-primary cursor-pointer">Contact</span>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
