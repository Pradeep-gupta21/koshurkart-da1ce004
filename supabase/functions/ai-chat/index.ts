// @ts-ignore: Deno npm import
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { z } from "zod";

declare const Deno: any;

import { AIService } from "@/ai/services/ai.service";
import { GeminiProvider } from "@/ai/providers/gemini.provider";
import { ToolRegistry, ToolExecutor, registerSystemTools } from "@/ai/tools";
import { createDecompositionPlanner } from "@/ai/planner";
import {
  createSessionMemory,
  createConversationMemory,
  createUserMemory,
  SupabaseMemoryStore,
} from "@/ai/memory";
import {
  AgentRegistry,
  createCustomerAgent,
  createVendorAgent,
  createAdminAgent,
  type Agent,
} from "@/ai/agents";
import { SupabaseJobStore } from "@/ai/jobs";

import { createMarketplaceTools, registerMarketplaceTools } from "@/ai/tools/marketplace";

import { getCorsHeaders } from "../_shared/cors.ts";

const RequestSchema = z.object({
  audience: z.enum(["customer", "vendor", "admin"]),
  message: z.string().min(1).max(2000),
  conversationId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
});

Deno.serve(async (req: Request) => {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // ---- 1. Auth ----
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const anonClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userErr,
  } = await anonClient.auth.getUser();

  if (userErr || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  // ---- 2. Parse request ----
  let parsed;
  try {
    parsed = RequestSchema.safeParse(await req.json());
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!parsed.success) {
    return json(
      { error: "Invalid input", details: parsed.error.flatten().fieldErrors },
      400,
    );
  }
  const { audience, message, conversationId, sessionId } = parsed.data;

  // ---- 3. Service client (needed for rate-limiting + role check) ----
  const supabaseClient = createClient(supabaseUrl, serviceRoleKey);

  // ---- 4. Rate limiting (C-3: sliding window, per user) ----
  const { data: allowed } = await supabaseClient.rpc("ai_chat_rate_limit", { _user_id: user.id });
  if (allowed === false) {
    await supabaseClient.from("analytics_events").insert({
      event_type: "ai_chat_rate_limited",
      user_id: user.id,
      metadata: { audience },
    });
    return json({ error: "Too many requests. Please wait a moment." }, 429);
  }

  // Log every attempt for the rate-limit accounting window.
  await supabaseClient.from("analytics_events").insert({
    event_type: "ai_chat_attempt",
    user_id: user.id,
    metadata: { audience },
  });

  // ---- 5. Audience role verification (H-1: never trust client) ----
  // Map audience → required role. "customer" is the default role for all
  // authenticated users, so any signed-in user qualifies.
  if (audience !== "customer") {
    const { data: roles } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", audience);

    if (!roles || roles.length === 0) {
      return json({ error: "Forbidden: insufficient role for this audience" }, 403);
    }
  }

  // ---- Conversation ownership (M-6: verify conversationId belongs to user) ----
  if (conversationId) {
    const { data: convOwner } = await supabaseClient
      .from("ai_memory")
      .select("user_id")
      .eq("conversation_id", conversationId)
      .limit(1)
      .maybeSingle();
    if (convOwner && convOwner.user_id !== user.id) {
      return json({ error: "Forbidden: conversation does not belong to this user" }, 403);
    }
  }

  // ---- 6. Dependency Injection (Composition Root) ----
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiApiKey) {
    return json({ error: "Server AI configuration missing" }, 500);
  }

  const provider = new GeminiProvider({ apiKey: geminiApiKey });
  const ai = new AIService({ provider });

  const jobStore = new SupabaseJobStore(supabaseClient);

  const services: { supabase: any; agents?: AgentRegistry; jobs: SupabaseJobStore } = {
    supabase: supabaseClient,
    jobs: jobStore
  };

  const tools = new ToolRegistry();
  registerMarketplaceTools(tools);
  registerSystemTools(tools);
  
  const executor = new ToolExecutor(tools, () => ({
    audience: audience as any,
    userId: user.id,
    conversationId,
    sessionId,
    services,
  }));
  const planner = createDecompositionPlanner();

  // Inject persistent memory store
  const memoryStore = new SupabaseMemoryStore(services.supabase);
  const memory = {
    session: createSessionMemory({ store: memoryStore }),
    conversation: createConversationMemory({ store: memoryStore }),
    user: createUserMemory({ store: memoryStore }),
  };

  const agents = new AgentRegistry([
    createCustomerAgent({ dependencies: { ai, tools, executor, planner, memory, services } }) as unknown as Agent<never>,
    createVendorAgent({ dependencies: { ai, tools, executor, planner, memory, services } }) as unknown as Agent<never>,
    createAdminAgent({ dependencies: { ai, tools, executor, planner, memory, services } }) as unknown as Agent<never>,
  ]);

  services.agents = agents;

  const agent = agents.getByAudience(audience as any);
  if (!agent) {
    return json({ error: "Unsupported audience" }, 400);
  }

  // ---- 4. Streaming Execution ----
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const iterable = agent.streamTurn(message, {
          userId: user.id,
          conversationId,
          sessionId,
        });

        for await (const event of iterable) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        }
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (error) {
        console.error("AI Stream Error:", error);
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "error",
              error: { code: "unknown", message: "Stream failed" },
            })}\n\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...getCorsHeaders(req),
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
