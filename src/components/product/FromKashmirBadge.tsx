import { Mountain } from "lucide-react";
import { cn } from "@/lib/utils";

interface FromKashmirBadgeProps {
  className?: string;
}

const FromKashmirBadge = ({ className }: FromKashmirBadgeProps) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent border border-accent/30 px-2 py-0.5 text-[10px] font-semibold tracking-wide",
      className,
    )}
  >
    <Mountain className="h-2.5 w-2.5" />
    From Kashmir
  </span>
);

export default FromKashmirBadge;
