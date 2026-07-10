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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const RequestSchema = z.object({
  audience: z.enum(["customer", "vendor", "admin"]),
  message: z.string().min(1).max(2000),
  conversationId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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

  // ---- 3. Dependency Injection (Composition Root) ----
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiApiKey) {
    return json({ error: "Server AI configuration missing" }, 500);
  }

  const provider = new GeminiProvider({ apiKey: geminiApiKey });
  const ai = new AIService({ provider });

  const supabaseClient = createClient(supabaseUrl, serviceRoleKey);
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
        const iterable = agent.stream(message, {
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
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
});
