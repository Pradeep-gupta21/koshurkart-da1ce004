/**
 * KoshurKart — ErrorBanner
 * =================================================================
 * Surfaces the current turn error from `useChat()` as an accessible alert,
 * offering a Retry action when the error is retryable. Renders nothing when
 * there is no error. Presentation only — it calls the `retry()` action the
 * provider exposes and never touches networking itself.
 */

import { AlertTriangle, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useChat } from "./ChatProvider";

export interface ErrorBannerProps {
  className?: string;
}

export function ErrorBanner({ className }: ErrorBannerProps): JSX.Element | null {
  const { error, retry, loading } = useChat();

  if (!error) return null;

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="flex-1">
        <p className="font-medium">Something went wrong</p>
        <p className="text-destructive/90">{error.message}</p>
      </div>
      {error.retryable && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void retry()}
          disabled={loading}
          className="h-7 shrink-0 gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Retry
        </Button>
      )}
    </div>
  );
}
