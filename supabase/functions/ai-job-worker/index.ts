// @ts-ignore: Deno npm import
import { ERROR_CODES } from "../../../src/shared/errorCodes.ts";
import { PaymentError, respondWithError } from "../../../src/shared/errorResponse.ts";
import { ErrorCategory } from "../../../src/shared/statusCodeMap.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

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
import { createMarketplaceTools, registerMarketplaceTools } from "@/ai/tools/marketplace";
import { SupabaseJobStore, JobWorker } from "@/ai/jobs";
import type { JobExecutor, Job } from "@/ai/jobs/types";
import type { AgentTaskPayload } from "@/ai/tools/system/dispatch_job.tool";

/**
 * An executor that maps a generic "agent_task" job to an actual
 * agent invocation within our framework.
 */
class AgentTaskExecutor implements JobExecutor<AgentTaskPayload, any> {
  readonly type = "agent_task";

  constructor(private readonly agents: AgentRegistry) {}

  async execute(
    job: Job<AgentTaskPayload, any>,
    updateProgress: (progress: number) => Promise<void>,
    signal: AbortSignal
  ): Promise<any> {
    const { targetAudience, objective, userId, conversationId, sessionId } = job.payload;
    
    const agent = this.agents.getByAudience(targetAudience);
    if (!agent) {
      throw new Error(`Target agent audience not found: ${targetAudience}`);
    }

    // Set initial progress
    await updateProgress(10);

    const result = await agent.chat(objective, {
      userId,
      conversationId,
      sessionId,
      signal
    });

    if (!result.ok) {
      throw new Error(`Agent task failed: ${result.error.message}`);
    }

    await updateProgress(100);
    return {
      message: result.response.message.content,
      toolInvocations: result.response.toolInvocations.length,
      roundtrips: result.response.roundtrips
    };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, "Method not allowed", false), {});
  }

  // --- 1. Service Auth ---
  // Background workers should be triggered securely (e.g., via pg_net with a secret,
  // or a private cron header). We'll assume a CRON_SECRET is provided.
  const authHeader = req.headers.get("Authorization");
  const expectedSecret = Deno.env.get("CRON_SECRET");
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return respondWithError(new PaymentError(ErrorCategory.AUTHENTICATION, ERROR_CODES.INTERNAL_ERROR, "Unauthorized worker invocation", false), {});
  }

  // --- 2. Composition Root ---
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const geminiApiKey = Deno.env.get("GEMINI_API_KEY")!;

  const provider = new GeminiProvider({ apiKey: geminiApiKey });
  const ai = new AIService({ provider });

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const jobStore = new SupabaseJobStore(supabase);

  const services: { supabase: any; agents?: AgentRegistry; jobs: SupabaseJobStore } = {
    supabase,
    jobs: jobStore
  };

  const tools = new ToolRegistry();
  registerMarketplaceTools(tools);
  registerSystemTools(tools);
  
  // Note: ToolExecutor requires an audience callback, but in a background job, 
  // the audience changes per job. The actual JobExecutor delegates to agent.chat() 
  // which will use its own internally-scoped execution if the DI allows it,
  // or we need to pass a dynamic factory here.
  // We'll create a factory that reads from current scope, but for now we supply admin.
  const executor = new ToolExecutor(tools, () => ({
    audience: "admin", // Background system fallback
    services,
  }));
  
  const planner = createDecompositionPlanner();
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

  // --- 3. Run Worker ---
  const agentExecutor = new AgentTaskExecutor(agents);
  
  const worker = new JobWorker({
    store: jobStore,
    executors: [agentExecutor],
    logger: console,
    defaultRetryDelayMs: 60000 // 1 minute
  });

  // We drain the queue until empty for this invocation.
  // In a real environment, you might limit processing time to avoid 
  // Edge Function timeouts (e.g. max 5 minutes).
  try {
    await worker.processQueue();
    return new Response(JSON.stringify({ success: true, message: "Queue processed" }), { status: 200 });
  } catch (err: any) {
    console.error("Worker process error", err);
    return respondWithError(new PaymentError(ErrorCategory.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR, err.message, false), {});
  }
});
