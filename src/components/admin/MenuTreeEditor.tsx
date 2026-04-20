import { ChevronDown, ChevronRight, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { MenuNode } from "@/services/sidebarMenuService";

interface Props {
  nodes: MenuNode[];
  onEdit: (node: MenuNode) => void;
  onDelete: (node: MenuNode) => void;
  onRestore?: (node: MenuNode) => void;
  depth?: number;
}

const MenuTreeEditor = ({ nodes, onEdit, onDelete, onRestore, depth = 0 }: Props) => {
  return (
    <ul className={depth === 0 ? "space-y-1" : "space-y-1 ml-6 border-l pl-3 mt-1"}>
      {nodes.map((node) => (
        <Row
          key={node.id}
          node={node}
          onEdit={onEdit}
          onDelete={onDelete}
          onRestore={onRestore}
          depth={depth}
        />
      ))}
    </ul>
  );
};

const Row = ({
  node, onEdit, onDelete, onRestore, depth,
}: { node: MenuNode } & Omit<Props, "nodes">) => {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <li>
      <div
        className={`flex items-center gap-2 rounded-md py-2 px-2 hover:bg-muted/60 transition ${
          !node.is_active ? "opacity-50" : ""
        }`}
      >
        <button
          type="button"
          onClick={() => hasChildren && setOpen((v) => !v)}
          className="w-5 h-5 flex items-center justify-center text-muted-foreground"
          aria-label={open ? "Collapse" : "Expand"}
        >
          {hasChildren ? (
            open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
          ) : null}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{node.title}</span>
            {node.route && (
              <code className="text-xs text-muted-foreground truncate">{node.route}</code>
            )}
            {!node.is_active && <Badge variant="outline" className="text-xs">Archived</Badge>}
            {node.role_access.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {node.role_access.join(", ")}
              </Badge>
            )}
            {node.role_access.length === 0 && (
              <Badge variant="outline" className="text-xs">public</Badge>
            )}
          </div>
        </div>

        <Button size="sm" variant="ghost" onClick={() => onEdit(node)} aria-label="Edit">
          <Pencil className="h-4 w-4" />
        </Button>
        {!node.is_active && onRestore ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onRestore(node)}
            aria-label="Restore"
            className="text-success hover:text-success"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onDelete(node)}
            aria-label="Archive"
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>

      {hasChildren && open && (
        <MenuTreeEditor
          nodes={node.children}
          onEdit={onEdit}
          onDelete={onDelete}
          onRestore={onRestore}
          depth={depth + 1}
        />
      )}
    </li>
  );
};

export default MenuTreeEditor;
