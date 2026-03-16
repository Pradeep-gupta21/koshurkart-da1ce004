import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  className?: string;
}

const EmptyState = ({ icon: Icon, title, description, actionLabel, actionHref, onAction, className }: EmptyStateProps) => (
  <div className={cn("flex flex-col items-center justify-center py-20 animate-fade-in", className)}>
    <div className="relative">
      <div className="absolute inset-0 bg-primary/5 rounded-full blur-2xl scale-150" />
      <div className="relative h-20 w-20 rounded-2xl bg-muted flex items-center justify-center mb-6">
        <Icon className="h-9 w-9 text-muted-foreground/60" strokeWidth={1.5} />
      </div>
    </div>
    <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
    <p className="text-sm text-muted-foreground mt-1.5 max-w-xs text-center">{description}</p>
    {actionLabel && (actionHref ? (
      <Button className="mt-6" asChild>
        <Link to={actionHref}>{actionLabel}</Link>
      </Button>
    ) : onAction ? (
      <Button className="mt-6" onClick={onAction}>{actionLabel}</Button>
    ) : null)}
  </div>
);

export default EmptyState;
