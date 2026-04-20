// Deno test for the menu edge function's pure helpers.
// Run with: deno test supabase/functions/menu/menu_test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildTree, CreateSchema } from "./index.ts";

Deno.test("buildTree: builds nested tree, sorts by order_index, drops orphans", () => {
  const rows = [
    { id: "a", title: "A", icon: null, route: null, parent_id: null, role_access: [], order_index: 1, is_active: true, section: "shop", badge_key: null },
    { id: "b", title: "B", icon: null, route: null, parent_id: null, role_access: [], order_index: 0, is_active: true, section: "shop", badge_key: null },
    { id: "c", title: "C", icon: null, route: null, parent_id: "a", role_access: [], order_index: 0, is_active: true, section: "shop", badge_key: null },
    { id: "d", title: "D", icon: null, route: null, parent_id: "missing", role_access: [], order_index: 0, is_active: true, section: "shop", badge_key: null },
  ];
  const tree = buildTree(rows, ["guest"]);
  // d's parent missing -> promoted to root. roots: B(0), A(1), D(?)
  assertEquals(tree.map((n) => n.id), ["b", "a", "d"]);
  const a = tree.find((n) => n.id === "a")!;
  assertEquals(a.children.map((n) => n.id), ["c"]);
});

Deno.test("buildTree: filters by role_access", () => {
  const rows = [
    { id: "pub", title: "Pub", icon: null, route: null, parent_id: null, role_access: [], order_index: 0, is_active: true, section: "shop", badge_key: null },
    { id: "adm", title: "Adm", icon: null, route: null, parent_id: null, role_access: ["admin"], order_index: 1, is_active: true, section: "shop", badge_key: null },
  ];
  const guest = buildTree(rows, ["guest"]);
  assertEquals(guest.map((n) => n.id), ["pub"]);
  const admin = buildTree(rows, ["admin"]);
  assertEquals(admin.map((n) => n.id).sort(), ["adm", "pub"]);
});

Deno.test("CreateSchema: rejects route without leading slash", () => {
  const r = CreateSchema.safeParse({ title: "X", route: "no-slash" });
  assert(!r.success);
});

Deno.test("CreateSchema: accepts minimal valid input", () => {
  const r = CreateSchema.safeParse({ title: "Hello" });
  assert(r.success);
  assertEquals(r.data.section, "shop");
  assertEquals(r.data.is_active, true);
});

Deno.test("CreateSchema: rejects empty title", () => {
  const r = CreateSchema.safeParse({ title: "  " });
  assert(!r.success);
});
