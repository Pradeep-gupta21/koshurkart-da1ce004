import { Mountain, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface BadgeMeta {
  label: string;
  tone: "saffron" | "kashmir" | "neutral";
  icon?: LucideIcon;
  className: string;
}

export const BADGE_REGISTRY: Record<string, BadgeMeta> = {
  "hard-to-get": {
    label: "Hard to get in J&K — now available",
    tone: "saffron",
    icon: Sparkles,
    className: "bg-accent/15 text-accent border-accent/30",
  },
  "authentic-kashmir": {
    label: "Authentic from Kashmir",
    tone: "kashmir",
    icon: Mountain,
    className: "bg-success/10 text-success border-success/30",
  },
};

export function getBadge(key?: string | null): BadgeMeta | null {
  if (!key) return null;
  if (BADGE_REGISTRY[key]) return BADGE_REGISTRY[key];
  // Fallback: humanise unknown keys
  return {
    label: key.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    tone: "neutral",
    className: "bg-muted text-muted-foreground border-border",
  };
}
