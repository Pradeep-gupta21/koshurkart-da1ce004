import { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Check, Loader2, Save, Store } from "lucide-react";
import OnboardingStepper from "./OnboardingStepper";
import { cn } from "@/lib/utils";
import type { SaveState } from "@/hooks/useOnboardingDraft";

interface Props {
  steps: { id: number; label: string }[];
  current: number;
  highest: number;
  onJump: (step: number) => void;
  onBack?: () => void;
  onNext?: () => void;
  onExit?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  isSubmitting?: boolean;
  saveState: SaveState;
  savedAt: Date | null;
  children: ReactNode;
}

const OnboardingShell = ({
  steps,
  current,
  highest,
  onJump,
  onBack,
  onNext,
  onExit,
  nextLabel = "Continue",
  nextDisabled,
  isSubmitting,
  saveState,
  savedAt,
  children,
}: Props) => {
  const savedText =
    saveState === "saving"
      ? "Saving…"
      : saveState === "saved" && savedAt
      ? `Saved ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : saveState === "error"
      ? "Save failed"
      : "";

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shrink-0">
                <Store className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-sm sm:text-base truncate">Vendor Onboarding</p>
                <p className="text-[11px] text-muted-foreground hidden sm:block">
                  Set up your store in a few quick steps
                </p>
              </div>
            </div>
            <div
              className={cn(
                "text-xs flex items-center gap-1.5 transition-opacity",
                saveState === "idle" ? "opacity-0" : "opacity-100",
                saveState === "error" ? "text-destructive" : "text-muted-foreground"
              )}
              aria-live="polite"
            >
              {saveState === "saving" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : saveState === "saved" ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">{savedText}</span>
            </div>
          </div>
          <div className="mt-4">
            <OnboardingStepper steps={steps} current={current} highest={highest} onJump={onJump} />
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-10 pb-32">{children}</div>
      </main>

      {/* Bottom action bar */}
      <footer className="sticky bottom-0 z-30 bg-background/95 backdrop-blur border-t">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            disabled={!onBack || isSubmitting}
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Back</span>
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onExit}
            disabled={isSubmitting}
            className="text-muted-foreground"
          >
            Save & Exit
          </Button>
          <Button
            type="button"
            onClick={onNext}
            disabled={nextDisabled || isSubmitting}
            className="min-w-[120px]"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                {nextLabel}
                <ArrowRight className="h-4 w-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </footer>
    </div>
  );
};

export default OnboardingShell;
