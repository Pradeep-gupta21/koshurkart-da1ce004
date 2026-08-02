import * as fs from "fs";
const envStr = fs.existsSync(".env") ? fs.readFileSync(".env", "utf-8") : "";
for (const line of envStr.split("\n")) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}
process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://mock.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "mock-key";

// Polyfill import.meta.env for tsx
(globalThis as any).import = { meta: { env: process.env } };

(global as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
(global as any).window = globalThis;

async function verify() {
  const { AIService } = await import("./src/ai/services/ai.service");
  const { CustomerAgent } = await import("./src/ai/agents/customer.agent");
  const { createGroqProvider } = await import("./src/ai/providers/groq.provider");
  const { ToolRegistry } = await import("./src/ai/tools/registry");
  const { CommerceToolRegistrar } = await import("./src/ai/tools/commerce/registration/CommerceToolRegistrar");
  const { CUSTOMER_SYSTEM_PROMPT } = await import("./src/ai/prompts/customer.system");
  const { RecommendForUserTool } = await import("./src/ai/tools/commerce/product/RecommendForUserTool");
  const { SearchProductsTool } = await import("./src/ai/tools/commerce/product/SearchProductsTool");
  const { RecentlyViewedStore } = await import("./src/ai/tools/commerce/recently-viewed/store");

  class MockExecutor {
    async run(call: any): Promise<any> {
      console.log(`    -> [EXECUTOR] Executing tool: ${call.name}`, call.arguments);
      
      if (call.name === "recommend_for_user") {
        const tool = new RecommendForUserTool();
        // Mock context with some history
        const mockContext = {
          userId: "user_123",
          services: {
            order: {
              getCustomerOrders: async () => ({ success: true, data: [{ items: [{ product: { category: "Pashmina", vendorId: "v1" } }] }] })
            },
            wishlist: {
              getWishlist: async () => ({ success: true, data: [{ productId: "prod_2", product: { category: "Walnut Wood", vendorId: "v2" } }] })
            }
          }
        };
        // mock viewed items
        RecentlyViewedStore.get = () => [{ id: "prod_3", category: "Saffron", vendorId: "v3" }] as any;

        const res = await tool.execute(call.arguments, mockContext as any);
        if (res.ok) {
           return { toolCallId: call.id, isError: false, result: res.data };
        } else {
           return { toolCallId: call.id, isError: true, result: res.error };
        }
      }
      
      if (call.name === "search_products") {
        // returning some mock products for the recommendation tool to score
        return { toolCallId: call.id, isError: false, result: { products: [
           { id: "prod_1", title: "Pashmina Shawl", category: "Pashmina", price: 5000, vendorId: "v1" },
           { id: "prod_2", title: "Walnut Box", category: "Walnut Wood", price: 2000, vendorId: "v2" },
           { id: "prod_3", title: "Kashmiri Saffron", category: "Saffron", price: 1000, vendorId: "v3" },
           { id: "prod_4", title: "Generic Item", category: "Other", price: 500, vendorId: "v4" }
        ] } };
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
  const getTool = registry.get("recommend_for_user");
  if (getTool) console.log("✓ recommend_for_user is registered.");
  else console.error("✗ recommend_for_user missing.");

  console.log("\n--- 2. Testing Scoring ---");
  const tool = new RecommendForUserTool();
  // Override searchProducts tool execution
  const mockContext = {
    userId: "user_123",
    services: {
      order: { getCustomerOrders: async () => ({ success: true, data: [{ items: [{ product: { category: "Pashmina", vendorId: "v1" } }] }] }) },
      wishlist: { getWishlist: async () => ({ success: true, data: [{ productId: "prod_2", product: { category: "Walnut Wood", vendorId: "v2" } }] }) }
    }
  };
  RecentlyViewedStore.get = () => [{ id: "prod_3", category: "Saffron", vendorId: "v3" }] as any;
  
  // Mock SearchProductsTool directly
  SearchProductsTool.prototype.execute = async () => ({
      ok: true,
      data: {
          products: [
             { id: "prod_1", title: "Pashmina Shawl", category: "Pashmina", price: 5000, vendorId: "v1" },
             { id: "prod_2", title: "Walnut Box", category: "Walnut Wood", price: 2000, vendorId: "v2" },
             { id: "prod_3", title: "Kashmiri Saffron", category: "Saffron", price: 1000, vendorId: "v3" },
             { id: "prod_4", title: "Generic Item", category: "Other", price: 500, vendorId: "v4" }
          ]
      }
  } as any);
  
  // We will manually execute the tool to test its internal scoring logic
  console.log("\n  -> Executing tool locally to test scoring logic...");
  const res = await tool.execute({ preferredCategories: ["Walnut Wood"] }, mockContext as any);
  if (res.ok) {
     console.log("  ✅ Tool execution successful.");
     console.log(`  -> Found ${res.data.recommendations.length} recommendations.`);
     res.data.recommendations.forEach((r, i) => {
         console.log(`     ${i + 1}. [${r.score}] ${r.product.title} (${r.confidence}) - ${r.reason}`);
     });
  } else {
     console.error("  ❌ Tool execution failed:", res.error);
  }

  console.log("\n--- 3. Testing Prompt Routing (Static) ---");
  const promptText = CUSTOMER_SYSTEM_PROMPT.toString();
  const requiredPhrases = [
    "Recommend something for me",
    "What should I buy?",
    "Based on my history",
    "Suggest products",
    "Personalized recommendations",
    "recommend_for_user"
  ];
  let allFound = true;
  for (const phrase of requiredPhrases) {
    if (!promptText.includes(phrase)) {
      console.error(`❌ Prompt is missing phrase: "${phrase}"`);
      allFound = false;
    }
  }
  if (allFound) {
     console.log("✅ Prompt includes all required recommend_for_user routing phrases.");
  }

  console.log("\n--- 4. Testing Prompt Routing & Generation (Live Agent) ---");
  const prompts = [
    "Recommend something for me",
    "What should I buy based on my history?"
  ];

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
