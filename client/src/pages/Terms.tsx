
import { Card, CardContent } from "@/components/ui/card";
import Navigation from "@/components/Navigation";
import { Footer } from "@/components/Footer";

export default function Terms() {
  return (
    <>
      <Navigation />
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
              <h2>3. Limitations</h2>
              <p>You expressly understand and agree that your use of the service is at your sole risk and that the service is provided "as is" and "as available."</p>
            </div>
          </CardContent>
        </Card>
      </div>
      <Footer />
    </>
  );
}
