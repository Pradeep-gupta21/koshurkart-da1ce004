// Dynamic admin-managed sidebar menu API
// Routes:
//   GET    /menu?section=shop|dashboard   -> public, role-filtered tree
//   POST   /menu                          -> admin only, create item
//   PUT    /menu/:id                      -> admin only, update item
//   DELETE /menu/:id                      -> admin only, soft delete (cascades to descendants)
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
};

const APP_ROLES = ["user", "vendor", "admin"] as const;
const SECTIONS = ["shop", "dashboard"] as const;

export const CreateSchema = z.object({
  title: z.string().trim().min(1).max(80),
  icon: z.string().trim().max(40).optional().nullable(),
  route: z.string().trim().max(200).regex(/^\//, "route must start with /").optional().nullable(),
  parent_id: z.string().uuid().optional().nullable(),
  role_access: z.array(z.enum(APP_ROLES)).default([]),
  order_index: z.number().int().min(0).max(10000).default(0),
  is_active: z.boolean().default(true),
  section: z.enum(SECTIONS).default("shop"),
  badge_key: z.string().trim().max(60).optional().nullable(),
}).strict();

export const UpdateSchema = CreateSchema.partial();

interface MenuRow {
  id: string;
  title: string;
  icon: string | null;
  route: string | null;
  parent_id: string | null;
  role_access: string[];
  order_index: number;
  is_active: boolean;
  section: string;
  badge_key: string | null;
}

interface MenuNode extends MenuRow {
  children: MenuNode[];
}

// ---------- in-memory cache (per edge instance) ----------
const cache = new Map<string, { data: MenuNode[]; expires: number }>();
const TTL_MS = 5 * 60 * 1000;

function cacheKey(section: string, roles: string[]) {
  return `${section}::${[...roles].sort().join(",")}`;
}
function invalidateCache() {
  cache.clear();
}

// ---------- helpers ----------
function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

async function getRolesForUser(supabase: SupabaseClient, userId: string | null): Promise<string[]> {
  if (!userId) return ["guest"];
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: { role: string }) => r.role);
  return roles.length > 0 ? roles : ["user"];
}

async function requireAdmin(req: Request): Promise<
  { ok: true; userId: string; supabase: SupabaseClient } | { ok: false; res: Response }
> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, res: json({ error: "Unauthorized" }, 401) };
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData?.user?.id) {
    return { ok: false, res: json({ error: "Unauthorized" }, 401) };
  }
  const userId = userData.user.id;
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) return { ok: false, res: json({ error: "Forbidden" }, 403) };
  return { ok: true, userId, supabase };
}

export function buildTree(rows: MenuRow[], userRoles: string[]): MenuNode[] {
  const allowed = (r: MenuRow) =>
    r.role_access.length === 0 || r.role_access.some((role) => userRoles.includes(role));

  const visible = rows.filter(allowed);
  const visibleIds = new Set(visible.map((r) => r.id));

  const nodes = new Map<string, MenuNode>();
  for (const r of visible) nodes.set(r.id, { ...r, children: [] });

  const roots: MenuNode[] = [];
  for (const node of nodes.values()) {
    // Drop orphans whose parent was filtered out
    if (node.parent_id && visibleIds.has(node.parent_id)) {
      nodes.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortRec = (list: MenuNode[]) => {
    list.sort((a, b) => a.order_index - b.order_index);
    for (const n of list) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

// Cycle prevention: ensure parent's ancestors don't include the node being updated.
async function wouldCreateCycle(
  supabase: SupabaseClient,
  nodeId: string,
  newParentId: string,
): Promise<boolean> {
  if (nodeId === newParentId) return true;
  let cursor: string | null = newParentId;
  for (let i = 0; i < 50 && cursor; i++) {
    const { data } = await supabase
      .from("menu_items")
      .select("parent_id")
      .eq("id", cursor)
      .maybeSingle();
    if (!data) return false;
    if (data.parent_id === nodeId) return true;
    cursor = data.parent_id;
  }
  return false;
}

// ---------- handlers ----------
async function handleGet(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const section = url.searchParams.get("section") ?? "shop";
  if (!SECTIONS.includes(section as typeof SECTIONS[number])) {
    return json({ error: "Invalid section" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Identify caller (optional auth) for role-aware filtering
  const authHeader = req.headers.get("Authorization");
  let userId: string | null = null;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabase.auth.getUser(token);
    userId = data?.user?.id ?? null;
  }
  const roles = await getRolesForUser(supabase, userId);

  const key = cacheKey(section, roles);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) {
    return json(
      { tree: cached.data },
      200,
      { "Cache-Control": "private, max-age=60", "X-Cache": "HIT" },
    );
  }

  const { data: rows, error } = await supabase
    .from("menu_items")
    .select("id,title,icon,route,parent_id,role_access,order_index,is_active,section,badge_key")
    .eq("section", section)
    .eq("is_active", true)
    .order("order_index", { ascending: true });

  if (error) return json({ error: error.message }, 500);

  const tree = buildTree(rows ?? [], roles);
  cache.set(key, { data: tree, expires: Date.now() + TTL_MS });

  return json(
    { tree },
    200,
    { "Cache-Control": "private, max-age=60", "X-Cache": "MISS" },
  );
}

async function handlePost(req: Request): Promise<Response> {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

  const { data, error } = await auth.supabase
    .from("menu_items")
    .insert(parsed.data)
    .select()
    .single();
  if (error) return json({ error: error.message }, 400);

  invalidateCache();
  return json({ item: data }, 201);
}

async function handlePut(req: Request, id: string): Promise<Response> {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  let body: unknown;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);

  if (parsed.data.parent_id) {
    if (await wouldCreateCycle(auth.supabase, id, parsed.data.parent_id)) {
      return json({ error: "Cannot set parent: would create a cycle" }, 400);
    }
  }

  const { data, error } = await auth.supabase
    .from("menu_items")
    .update(parsed.data)
    .eq("id", id)
    .select()
    .single();
  if (error) return json({ error: error.message }, 400);

  invalidateCache();
  return json({ item: data });
}

async function handleDelete(req: Request, id: string): Promise<Response> {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  // Soft-delete this node and all descendants (BFS through table)
  const toDeactivate = new Set<string>([id]);
  let frontier: string[] = [id];
  for (let depth = 0; depth < 10 && frontier.length > 0; depth++) {
    const { data } = await auth.supabase
      .from("menu_items")
      .select("id")
      .in("parent_id", frontier);
    const next = (data ?? []).map((r: { id: string }) => r.id);
    next.forEach((n) => toDeactivate.add(n));
    frontier = next;
  }

  const { error } = await auth.supabase
    .from("menu_items")
    .update({ is_active: false })
    .in("id", Array.from(toDeactivate));
  if (error) return json({ error: error.message }, 400);

  invalidateCache();
  return json({ deactivated: toDeactivate.size });
}

// ---------- entry ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    // Path is .../functions/v1/menu OR .../functions/v1/menu/<id>
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.lastIndexOf("menu");
    const idParam = idx >= 0 && parts.length > idx + 1 ? parts[idx + 1] : null;

    if (req.method === "GET") return await handleGet(req);
    if (req.method === "POST") return await handlePost(req);
    if (req.method === "PUT") {
      if (!idParam) return json({ error: "Missing id" }, 400);
      return await handlePut(req, idParam);
    }
    if (req.method === "DELETE") {
      if (!idParam) return json({ error: "Missing id" }, 400);
      return await handleDelete(req, idParam);
    }
    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    console.error("menu function error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
