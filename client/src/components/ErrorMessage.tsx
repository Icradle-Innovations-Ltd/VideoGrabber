import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { AlertTriangle } from "lucide-react";

interface ErrorMessageProps {
  message: string;
  onDismiss: () => void;
  visible: boolean;
}

export function ErrorMessage({ message, onDismiss, visible }: ErrorMessageProps) {
  if (!visible) return null;

  return (
    <section>
      <Card className="max-w-3xl mx-auto">
        <CardContent className="p-4 md:p-6">
          <div className="flex items-center text-red-600 mb-4">
            <AlertTriangle className="h-6 w-6 mr-2" />
            <h3 className="text-xl font-bold">Error</h3>
          </div>

          <p className="mb-4">{message}</p>

          <Button onClick={onDismiss} className="font-medium">
            Try Again
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
