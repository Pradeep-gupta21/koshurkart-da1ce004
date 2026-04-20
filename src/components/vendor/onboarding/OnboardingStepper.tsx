import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  steps: { id: number; label: string }[];
  current: number;
  highest: number;
  onJump: (step: number) => void;
}

const OnboardingStepper = ({ steps, current, highest, onJump }: Props) => {
  const currentLabel = steps.find((s) => s.id === current)?.label ?? "";
  return (
    <>
      {/* Mobile: compact label + bar */}
      <div className="md:hidden">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            Step {current} of {steps.length}
          </span>
          <span>{currentLabel}</span>
        </div>
        <div className="mt-2 h-1 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${(current / steps.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Desktop: dotted stepper */}
      <ol className="hidden md:flex items-center w-full">
        {steps.map((s, idx) => {
          const isCompleted = s.id < current || s.id <= highest && s.id !== current;
          const isCurrent = s.id === current;
          const isClickable = s.id <= highest;
          return (
            <li key={s.id} className="flex-1 flex items-center last:flex-none">
              <button
                type="button"
                onClick={() => isClickable && onJump(s.id)}
                disabled={!isClickable}
                className={cn(
                  "group flex flex-col items-center gap-2 focus:outline-none",
                  isClickable && "cursor-pointer"
                )}
              >
                <span
                  className={cn(
                    "h-9 w-9 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all",
                    isCurrent &&
                      "bg-primary text-primary-foreground border-primary ring-4 ring-primary/15",
                    !isCurrent && s.id < current && "bg-primary text-primary-foreground border-primary",
                    !isCurrent && s.id > current && "bg-background text-muted-foreground border-muted"
                  )}
                >
                  {s.id < current ? <Check className="h-4 w-4" /> : s.id}
                </span>
                <span
                  className={cn(
                    "text-xs whitespace-nowrap",
                    isCurrent ? "text-foreground font-medium" : "text-muted-foreground"
                  )}
                >
                  {s.label}
                </span>
              </button>
              {idx < steps.length - 1 && (
                <span
                  className={cn(
                    "flex-1 h-0.5 mx-2 transition-colors",
                    s.id < current ? "bg-primary" : "bg-muted"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
};

export default OnboardingStepper;
