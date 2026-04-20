import { memo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import SidebarItem from "./SidebarItem";
import { resolveLucideIcon } from "@/lib/iconRegistry";
import { getBadge } from "@/lib/badgeRegistry";
import type { MenuNode } from "@/services/sidebarMenuService";

interface ExpandableMenuProps {
  node: MenuNode;
  level?: number;
}

const ExpandableMenu = memo(({ node, level = 0 }: ExpandableMenuProps) => {
  // Default collapsed for an uncluttered, premium drawer
  const [open, setOpen] = useState(false);
  const hasChildren = !!node.children && node.children.length > 0;
  const childCount = node.children?.length ?? 0;
  const Icon = resolveLucideIcon(node.icon);
  const badge = getBadge(node.badge_key);
  const BadgeIcon = badge?.icon;

  if (!hasChildren) {
    return (
      <SidebarItem
        to={node.route ?? "#"}
        label={node.title}
        icon={Icon ?? undefined}
        indent={level > 0}
      />
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`subnav-${node.id}`}
        className={cn(
          "w-full flex items-center gap-3 px-5 h-11 text-sm text-foreground hover:bg-accent/40 transition-colors duration-150",
          level > 0 && "pl-10",
        )}
      >
        {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
        <span className="truncate text-left font-medium">{node.title}</span>
        {childCount > 0 && (
          <span className="text-[10px] font-medium text-muted-foreground tabular-nums ml-1">
            {childCount}
          </span>
        )}
        <span className="flex-1" />
        <ChevronRight
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200",
            open && "rotate-90",
          )}
          aria-hidden="true"
        />
      </button>
      <div
        id={`subnav-${node.id}`}
        role="region"
        className={cn(
          "overflow-hidden transition-all duration-200",
          open ? "max-h-[1000px]" : "max-h-0",
        )}
      >
        {badge && level === 0 && (
          <div className={cn("mx-5 mt-1 mb-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold leading-none", badge.className)}>
            {BadgeIcon && <BadgeIcon className="h-3 w-3" aria-hidden="true" />}
            <span>{badge.label}</span>
          </div>
        )}
        {node.route && <SidebarItem to={node.route} label={`All ${node.title}`} indent />}
        {node.children.map((child) => (
          <ExpandableMenu key={child.id} node={child} level={level + 1} />
        ))}
      </div>
    </div>
  );
});

ExpandableMenu.displayName = "ExpandableMenu";
export default ExpandableMenu;
