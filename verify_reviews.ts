import * as fs from "fs";
const envStr = fs.existsSync(".env") ? fs.readFileSync(".env", "utf-8") : "";
for (const line of envStr.split("\n")) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}
process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://mock.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "mock-key";
(global as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
(globalThis as any).import = { meta: { env: process.env } };
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
(global as any).window = globalThis;


async function verify() {
  const { AIService } = await import("./src/ai/services/ai.service");
  const { CustomerAgent } = await import("./src/ai/agents/customer.agent");
  const { createGroqProvider } = await import("./src/ai/providers/groq.provider");
  const { ToolRegistry } = await import("./src/ai/tools/registry");
  const { CommerceToolRegistrar } = await import("./src/ai/tools/commerce/registration/CommerceToolRegistrar");
  const { CUSTOMER_SYSTEM_PROMPT } = await import("./src/ai/prompts/customer.system");
  const { reviewService } = await import("./src/services/reviewService");
  const { ReviewProductsTool } = await import("./src/ai/tools/commerce/product/ReviewProductsTool");

  // Mock the review service for testing
  reviewService.getReviewSummary = async (productId: string) => ({
    average: 4.5,
    total: 2,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 } as any
  });
  
  reviewService.getReviews = async (productId: string, opts: any) => ([
    {
      id: "rev1", user_id: "u1", product_id: productId, order_id: null,
      rating: 5, title: "Great", comment: "Absolutely love it!", images: [], videos: [],
      helpful_count: 5, is_verified_purchase: true, created_at: "2023-01-01"
    },
    {
      id: "rev2", user_id: "u2", product_id: productId, order_id: null,
      rating: 4, title: "Good", comment: "Nice quality.", images: [], videos: [],
      helpful_count: 2, is_verified_purchase: true, created_at: "2023-01-02"
    }
  ] as any);

  class MockExecutor {
    async run(call: any): Promise<any> {
      console.log(`    -> [EXECUTOR] Executing tool: ${call.name}`, call.arguments);
      
      if (call.name === "review_products") {
          const tool = new ReviewProductsTool();
          const context = {
            services: {
              product: {
                searchProducts: async () => ({ success: true, data: [{ id: "prod_1", title: "Pashmina Shawl" }] }),
                getProductById: async (id: string) => ({ success: true, data: { id, title: "Pashmina Shawl" } })
              }
            }
          };
          const result = await tool.run(call.arguments, context as any);
          return { toolCallId: call.id, isError: false, result: (result as any).data };
      }
      
      return { toolCallId: call.id, isError: false, result: { message: "Mocked success" } };
    }
  }

  const provider = createGroqProvider({ apiKey: process.env.VITE_GROQ_API_KEY! });
  const registry = new ToolRegistry();
  CommerceToolRegistrar.register(registry);

  const ai = new AIService({
    provider,
    registry,
    executor: new MockExecutor() as any,
    systemPrompts: { customer: CUSTOMER_SYSTEM_PROMPT }
  });

  const agent = new CustomerAgent({
    dependencies: { ai, tools: registry, executor: new MockExecutor() as any },
    defaultOptions: { temperature: 0.1 }
  });

  console.log("--- 1. Testing Registration ---");
  const getTool = registry.get("review_products");
  if (getTool) console.log("✓ review_products is registered.");
  else console.error("✗ review_products missing.");

  console.log("\n--- 2. Testing ReviewProductsTool Execution ---");
  const context = {
    services: {
      product: {
        searchProducts: async (q: string) => ({ success: true, data: [{ id: "prod_1", title: "Pashmina Shawl" }] }),
        getProductById: async (id: string) => ({ success: true, data: { id, title: "Pashmina Shawl" } })
      }
    }
  };
  const result = await (getTool as any).run({ query: "Pashmina" }, context as any);
  if (result.ok && result.data.averageRating === 4.5 && result.data.totalReviews === 2) {
    console.log("✓ Review aggregation successful:", result.data);
  } else {
    console.error("✗ Review aggregation failed.", result);
  }

  const prompts = [
    "Is the Pashmina shawl any good? What do buyers think?"
  ];

  console.log("\n--- 3. Testing Prompt Routing ---");
  for (const prompt of prompts) {
    console.log(`\nUser: "${prompt}"`);
    try {
      const result = await agent.chat({ role: "user", content: prompt }, { userId: "user_123", conversationId: "conv_" + Date.now() });
      if (result.success) {
        console.log(`AI: ${result.data.message.content}`);
      } else {
        console.error("Agent error:", result.error);
      }
    } catch (e) {
      console.error("Caught error:", e);
    }
  }
}

verify().catch(console.error);
