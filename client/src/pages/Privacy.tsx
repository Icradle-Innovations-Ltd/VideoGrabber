
import { Card, CardContent } from "@/components/ui/card";
import Navigation from "@/components/Navigation";
import { Footer } from "@/components/Footer";

const buildDate = new Date().toLocaleDateString();

export default function Privacy() {
  return (
    <>
      <Navigation />
      <div className="container mx-auto px-4 py-8">
        <Card>
          <CardContent className="pt-6">
            <h1 className="text-2xl font-bold mb-4">Privacy Policy</h1>
            <div className="prose dark:prose-invert">
              <p>Last updated: {buildDate}</p>
              <h2>Information Collection</h2>
              <p>We collect minimal information necessary to provide our service. This includes:</p>
              <ul>
                <li>Temporary storage of video URLs for processing</li>
                <li>Basic usage analytics</li>
              </ul>
              <h2>Data Usage</h2>
              <p>We use the collected information solely for providing and improving our service. We do not share any personal information with third parties.</p>
              <h2>Data Storage</h2>
              <p>All processed videos and temporary files are automatically deleted after download completion.</p>
              <h2>Your Rights</h2>
              <p>You have the right to request information about your data and its deletion.</p>
            </div>
          </CardContent>
        </Card>
      </div>
      <Footer />
    </>
  );
}
