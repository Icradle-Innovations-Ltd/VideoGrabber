
import { Link } from "wouter";

export default function Navigation() {
  return (
    <nav className="bg-background border-b mb-8">
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <Link href="/">
            <a className="text-xl font-bold hover:text-primary">YouTube Downloader</a>
          </Link>
          <div className="flex gap-4">
            <Link href="/terms">
              <a className="hover:text-primary">Terms</a>
            </Link>
            <Link href="/privacy">
              <a className="hover:text-primary">Privacy</a>
            </Link>
            <Link href="/contact">
              <a className="hover:text-primary">Contact</a>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
