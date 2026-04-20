import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SidebarErrorProps {
  onRetry: () => void;
  message?: string;
}

/**
 * Inline error block for the sidebar. Used when the menu query fails so the
 * drawer stays useful (header + dismissible banner remain visible above this).
 */
const SidebarError = ({ onRetry, message = "Couldn't load menu" }: SidebarErrorProps) => (
  <div
    role="alert"
    className="flex flex-col items-center justify-center gap-3 px-6 py-10 text-center"
  >
    <AlertCircle className="h-8 w-8 text-muted-foreground" aria-hidden />
    <div className="space-y-1">
      <p className="text-sm font-medium">{message}</p>
      <p className="text-xs text-muted-foreground">
        Check your connection and try again.
      </p>
    </div>
    <Button size="sm" variant="outline" onClick={onRetry} className="gap-2">
      <RefreshCw className="h-3.5 w-3.5" aria-hidden />
      Retry
    </Button>
  </div>
);

export default SidebarError;
