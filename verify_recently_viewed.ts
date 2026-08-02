import * as fs from "fs";
const envStr = fs.existsSync(".env") ? fs.readFileSync(".env", "utf-8") : "";
for (const line of envStr.split("\n")) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}
process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://mock.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || "mock-key";
(global as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
(global as any).window = globalThis;

// @ts-ignore
if (typeof process !== "undefined") {
    // @ts-ignore
    if (!import.meta.env) (import.meta as any).env = {};
    // @ts-ignore
    Object.assign(import.meta.env, process.env);
}

async function verify() {
  const { AIService } = await import("./src/ai/services/ai.service");
  const { CustomerAgent } = await import("./src/ai/agents/customer.agent");
  const { createGroqProvider } = await import("./src/ai/providers/groq.provider");
  const { ToolRegistry } = await import("./src/ai/tools/registry");
  const { CommerceToolRegistrar } = await import("./src/ai/tools/commerce/registration/CommerceToolRegistrar");
  const { CUSTOMER_SYSTEM_PROMPT } = await import("./src/ai/prompts/customer.system");
  const { RecentlyViewedStore } = await import("./src/ai/tools/commerce/recently-viewed/store");
  const { GetProductTool } = await import("./src/ai/tools/commerce/product/GetProductTool");

  class MockExecutor {
    async run(call: any): Promise<any> {
      console.log(`    -> [EXECUTOR] Executing tool: ${call.name}`, call.arguments);
      
      if (call.name === "search_products") {
          return { toolCallId: call.id, isError: false, result: { products: [{ id: "prod_1", title: "Pashmina Shawl", price: 5000 }] } };
      }
      if (call.name === "get_product") {
          const tool = new GetProductTool();
          return { toolCallId: call.id, isError: false, result: { id: call.arguments.productId || "prod_1", title: "Mocked Product", price: 100 } };
      }
      
      if (call.name === "get_recently_viewed") {
        const history = RecentlyViewedStore.get("user_123");
        return { toolCallId: call.id, isError: false, result: { items: history, message: `Found ${history.length} items.` } };
      }
      
      if (call.name === "clear_recently_viewed") {
        RecentlyViewedStore.clear("user_123");
        return { toolCallId: call.id, isError: false, result: { message: "History cleared." } };
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
  const getTool = registry.get("get_recently_viewed");
  if (getTool) console.log("✓ get_recently_viewed is registered.");
  else console.error("✗ get_recently_viewed missing.");

  console.log("\n--- 2. Testing Automatic Recording ---");
  const getProductTool = registry.get("get_product") as any;
  const context = {
    customer: { id: "user_123" },
    services: {
      product: {
        getProductById: async (id: string) => ({ success: true, data: { id, title: "Test Product", category: "Test", price: 100, thumbnail: "test.jpg" } })
      }
    }
  };
  await getProductTool.run({ productId: "prod_123" }, context as any);
  
  const history = RecentlyViewedStore.get("user_123");
  if (history.length === 1 && history[0].product.id === "prod_123") {
    console.log("✓ Automatic recording successful:", history[0].product.title);
  } else {
    console.error("✗ Automatic recording failed.", history);
  }

  const prompts = [
    "What did I recently see?",
    "Clear my history"
  ];

  console.log("\n--- 3. Testing Routing & Retrieval ---");
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
