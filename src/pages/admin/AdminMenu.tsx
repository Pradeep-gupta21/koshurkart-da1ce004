import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
  sidebarMenuService, type MenuItemInput, type MenuNode,
} from "@/services/sidebarMenuService";
import { menuItemSchema } from "@/lib/validators/menuItemSchema";
import MenuItemForm from "@/components/admin/MenuItemForm";
import MenuTreeEditor from "@/components/admin/MenuTreeEditor";

type Section = "shop" | "dashboard";

const flatten = (nodes: MenuNode[]): MenuNode[] =>
  nodes.flatMap((n) => [n, ...flatten(n.children)]);

const AdminMenu = () => {
  const [section, setSection] = useState<Section>("shop");
  const [editing, setEditing] = useState<MenuNode | null>(null);
  const [open, setOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const qc = useQueryClient();

  const { data: tree = [], isLoading } = useQuery({
    queryKey: ["admin-menu", section],
    queryFn: () => sidebarMenuService.listAll(section),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-menu"] });
    qc.invalidateQueries({ queryKey: ["sidebar-menu"] });
  };

  const createMut = useMutation({
    mutationFn: (input: MenuItemInput) => sidebarMenuService.createItem(input),
    onSuccess: () => {
      toast({ title: "Menu item created" });
      invalidate();
      setOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast({ title: "Create failed", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<MenuItemInput> }) =>
      sidebarMenuService.updateItem(id, patch),
    onSuccess: () => {
      toast({ title: "Menu item updated" });
      invalidate();
      setOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => sidebarMenuService.deleteItem(id),
    onSuccess: () => {
      toast({ title: "Menu item deactivated" });
      invalidate();
    },
    onError: (e: Error) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  const restoreMut = useMutation({
    mutationFn: (id: string) => sidebarMenuService.updateItem(id, { is_active: true }),
    onSuccess: () => {
      toast({ title: "Menu item restored" });
      invalidate();
    },
    onError: (e: Error) => toast({ title: "Restore failed", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = async (input: MenuItemInput) => {
    // Client-side Zod validation as a safety net (server also validates)
    const parsed = menuItemSchema.safeParse({ ...input, section });
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "field"}: ${i.message}`).join("; ");
      toast({ title: "Invalid menu item", description: issues, variant: "destructive" });
      return;
    }
    if (editing) {
      await updateMut.mutateAsync({ id: editing.id, patch: parsed.data });
    } else {
      await createMut.mutateAsync({ ...parsed.data, section });
    }
  };

  const handleDelete = (node: MenuNode) => {
    if (confirm(`Archive "${node.title}" and all its children?`)) {
      deleteMut.mutate(node.id);
    }
  };

  const handleRestore = (node: MenuNode) => {
    restoreMut.mutate(node.id);
  };

  const openCreate = () => { setEditing(null); setOpen(true); };
  const openEdit = (node: MenuNode) => { setEditing(node); setOpen(true); };

  // Filter archived nodes from tree unless toggled on
  const visibleTree = useMemo(() => {
    if (showArchived) return tree;
    const filter = (nodes: MenuNode[]): MenuNode[] =>
      nodes
        .filter((n) => n.is_active)
        .map((n) => ({ ...n, children: filter(n.children) }));
    return filter(tree);
  }, [tree, showArchived]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Menu Management</h1>
          <p className="text-sm text-muted-foreground">
            Control sidebar navigation across the platform — role-aware, nested, and live-cached.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> New item
        </Button>
      </div>

      <Tabs value={section} onValueChange={(v) => setSection(v as Section)}>
        <TabsList>
          <TabsTrigger value="shop">Shop sidebar</TabsTrigger>
          <TabsTrigger value="dashboard">Dashboard sidebar</TabsTrigger>
        </TabsList>

        <TabsContent value={section} className="mt-4">
          <Card className="p-4">
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading menu…</p>
            ) : tree.length === 0 ? (
              <p className="text-sm text-muted-foreground">No items yet. Create your first one.</p>
            ) : (
              <MenuTreeEditor nodes={tree} onEdit={openEdit} onDelete={handleDelete} />
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit menu item" : "New menu item"}</DialogTitle>
          </DialogHeader>
          <MenuItemForm
            initial={editing}
            parentOptions={flatten(tree)}
            onSubmit={handleSubmit}
            onCancel={() => { setOpen(false); setEditing(null); }}
            saving={createMut.isPending || updateMut.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminMenu;
