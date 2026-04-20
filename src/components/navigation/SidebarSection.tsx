import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarSectionProps {
  label: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

const SidebarSection = ({ label, defaultOpen = true, children }: SidebarSectionProps) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border/50 last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
      >
        {label}
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      <div
        className={cn(
          "overflow-hidden transition-all duration-200",
          open ? "max-h-[1000px] opacity-100 pb-2" : "max-h-0 opacity-0"
        )}
      >
        {children}
      </div>
    </div>
  );
};

export default SidebarSection;
