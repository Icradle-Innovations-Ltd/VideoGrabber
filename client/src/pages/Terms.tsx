
import { Card, CardContent } from "@/components/ui/card";

export default function Terms() {
  return (
    <div className="container mx-auto px-4 py-8">
      <Card>
        <CardContent className="pt-6">
          <h1 className="text-2xl font-bold mb-4">Terms of Service</h1>
          <div className="prose dark:prose-invert">
            <p>Last updated: {new Date().toLocaleDateString()}</p>
            <h2>1. Terms</h2>
            <p>By accessing this website, you agree to be bound by these terms of service and agree that you are responsible for compliance with any applicable local laws.</p>
            <h2>2. Use License</h2>
            <p>This tool is for personal use only. You may not:</p>
            <ul>
              <li>Use this service for commercial purposes</li>
              <li>Attempt to decompile or reverse engineer any software contained on the website</li>
              <li>Remove any copyright or other proprietary notations</li>
            </ul>
            <h2>3. Disclaimer</h2>
            <p>The materials on this website are provided on an 'as is' basis. We make no warranties, expressed or implied, and hereby disclaim and negate all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
