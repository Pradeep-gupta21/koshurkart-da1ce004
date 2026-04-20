import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import type { MenuItemInput, MenuNode, MenuRole } from "@/services/sidebarMenuService";

const ROLES: MenuRole[] = ["user", "vendor", "admin"];

interface Props {
  initial?: MenuNode | null;
  parentOptions: MenuNode[];
  onSubmit: (input: MenuItemInput) => Promise<void>;
  onCancel: () => void;
  saving?: boolean;
}

const MenuItemForm = ({ initial, parentOptions, onSubmit, onCancel, saving }: Props) => {
  const [form, setForm] = useState<MenuItemInput>({
    title: "",
    icon: "",
    route: "",
    parent_id: null,
    role_access: [],
    order_index: 0,
    is_active: true,
    section: "shop",
    badge_key: "",
  });

  useEffect(() => {
    if (initial) {
      setForm({
        title: initial.title,
        icon: initial.icon ?? "",
        route: initial.route ?? "",
        parent_id: initial.parent_id,
        role_access: initial.role_access,
        order_index: initial.order_index,
        is_active: initial.is_active,
        section: initial.section,
        badge_key: initial.badge_key ?? "",
      });
    }
  }, [initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      ...form,
      icon: form.icon?.trim() || null,
      route: form.route?.trim() || null,
      badge_key: form.badge_key?.trim() || null,
      parent_id: form.parent_id || null,
    });
  };

  const toggleRole = (role: MenuRole) => {
    setForm((f) => ({
      ...f,
      role_access: f.role_access?.includes(role)
        ? f.role_access.filter((r) => r !== role)
        : [...(f.role_access ?? []), role],
    }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          required
          maxLength={80}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="icon">Icon (lucide name)</Label>
          <Input
            id="icon"
            maxLength={40}
            placeholder="e.g. tag, sparkles"
            value={form.icon ?? ""}
            onChange={(e) => setForm({ ...form, icon: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="route">Route</Label>
          <Input
            id="route"
            maxLength={200}
            placeholder="/search?sort=newest"
            value={form.route ?? ""}
            onChange={(e) => setForm({ ...form, route: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Section</Label>
          <Select
            value={form.section}
            onValueChange={(v) => setForm({ ...form, section: v as "shop" | "dashboard" })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="shop">Shop sidebar</SelectItem>
              <SelectItem value="dashboard">Dashboard sidebar</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Parent</Label>
          <Select
            value={form.parent_id ?? "none"}
            onValueChange={(v) => setForm({ ...form, parent_id: v === "none" ? null : v })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— None (top level)</SelectItem>
              {parentOptions
                .filter((o) => o.id !== initial?.id && o.section === form.section)
                .map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.title}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="order_index">Order index</Label>
          <Input
            id="order_index"
            type="number"
            min={0}
            value={form.order_index ?? 0}
            onChange={(e) => setForm({ ...form, order_index: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label htmlFor="badge_key">Badge key (optional)</Label>
          <Input
            id="badge_key"
            maxLength={60}
            value={form.badge_key ?? ""}
            onChange={(e) => setForm({ ...form, badge_key: e.target.value })}
          />
        </div>
      </div>

      <div>
        <Label className="block mb-2">Role access (empty = visible to everyone)</Label>
        <div className="flex gap-4">
          {ROLES.map((r) => (
            <label key={r} className="flex items-center gap-2 text-sm capitalize">
              <Checkbox
                checked={form.role_access?.includes(r) ?? false}
                onCheckedChange={() => toggleRole(r)}
              />
              {r}
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="is_active"
          checked={form.is_active ?? true}
          onCheckedChange={(v) => setForm({ ...form, is_active: v })}
        />
        <Label htmlFor="is_active">Active</Label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : initial ? "Update" : "Create"}
        </Button>
      </div>
    </form>
  );
};

export default MenuItemForm;
