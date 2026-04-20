import { memo } from "react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface SidebarItemProps {
  to: string;
  label: string;
  icon?: LucideIcon;
  end?: boolean;
  badge?: number;
  indent?: boolean;
}

const SidebarItem = memo(({ to, label, icon: Icon, end, badge, indent }: SidebarItemProps) => {
  return (
    <NavLink
      to={to}
      end={end}
      className={cn(
        "relative flex items-center gap-3 px-5 py-2.5 text-sm text-foreground hover:bg-muted transition-colors border-l-2 border-transparent",
        indent && "pl-10"
      )}
      activeClassName="bg-muted text-primary font-medium border-l-primary"
    >
      {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />}
      <span className="truncate flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto rounded-full bg-primary text-primary-foreground text-[10px] font-semibold px-2 py-0.5 min-w-[20px] text-center">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </NavLink>
  );
});

SidebarItem.displayName = "SidebarItem";
export default SidebarItem;
