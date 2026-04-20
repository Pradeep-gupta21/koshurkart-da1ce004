import { memo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import SidebarItem from "./SidebarItem";
import type { SidebarCategoryNode } from "@/services/sidebarMenuService";

interface ExpandableMenuProps {
  node: SidebarCategoryNode;
  level?: number;
}

const ExpandableMenu = memo(({ node, level = 0 }: ExpandableMenuProps) => {
  const [open, setOpen] = useState(false);
  const hasChildren = !!node.children && node.children.length > 0;
  const to = `/search?category=${encodeURIComponent(node.slug)}`;

  if (!hasChildren) {
    return <SidebarItem to={to} label={node.label} indent={level > 0} />;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={`subnav-${node.id}`}
        className={cn(
          "w-full flex items-center gap-2 px-5 py-2.5 text-sm text-foreground hover:bg-muted transition-colors",
          level > 0 && "pl-10"
        )}
      >
        <span className="truncate flex-1 text-left">{node.label}</span>
        {node.count > 0 && (
          <span className="text-xs text-muted-foreground">{node.count}</span>
        )}
        <ChevronRight
          className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-90")}
          aria-hidden="true"
        />
      </button>
      <div
        id={`subnav-${node.id}`}
        role="region"
        className={cn(
          "overflow-hidden transition-all duration-200",
          open ? "max-h-[1000px]" : "max-h-0"
        )}
      >
        <SidebarItem to={to} label={`All ${node.label}`} indent />
        {node.children!.map((child) => (
          <ExpandableMenu key={child.id} node={child} level={level + 1} />
        ))}
      </div>
    </div>
  );
});

ExpandableMenu.displayName = "ExpandableMenu";
export default ExpandableMenu;
