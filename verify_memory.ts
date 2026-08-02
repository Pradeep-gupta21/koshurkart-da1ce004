import * as fs from "fs";
const envStr = fs.existsSync(".env") ? fs.readFileSync(".env", "utf-8") : "";
for (const line of envStr.split("\n")) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}
if (!process.env.VITE_SUPABASE_URL) process.env.VITE_SUPABASE_URL = "https://mock.supabase.co";
if (!process.env.VITE_SUPABASE_ANON_KEY) process.env.VITE_SUPABASE_ANON_KEY = "mock_key";

(global as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
(global as any).window = globalThis;

// @ts-ignore
if (typeof process !== "undefined" && !import.meta.env) {
    // @ts-ignore
    import.meta.env = process.env;
}

async function runTest() {
  const { AIService } = await import("./src/ai/services/ai.service");
  const { CustomerAgent } = await import("./src/ai/agents/customer.agent");
  const { createGroqProvider } = await import("./src/ai/providers/groq.provider");
  const { ToolRegistry } = await import("./src/ai/tools/registry");
  const { CommerceToolRegistrar } = await import("./src/ai/tools/commerce/registration/CommerceToolRegistrar");
  const { CUSTOMER_SYSTEM_PROMPT } = await import("./src/ai/prompts/customer.system");
  const { memoryStore } = await import("./src/ai/tools/commerce/memory/CustomerMemoryStore");

  class MockExecutor {
    private registry: any;
    constructor(registry: any) {
      this.registry = registry;
    }
    async run(call: any): Promise<any> {
      console.log(`    -> [EXECUTOR] Executing tool: ${call.name}`, call.arguments);
      const tool = this.registry.getTool(call.name);
      if (!tool) {
        return { toolCallId: call.id, isError: true, result: { message: "Tool not found" } };
      }
      
      if (call.name.includes("preference")) {
          const result = await (tool as any).run(call.arguments, { userId: "user_123" });
          return { toolCallId: call.id, isError: !result.success, result: result.success ? result.data : result.error };
      }

      if (call.name === "search_products") {
          return { toolCallId: call.id, isError: false, result: { products: [{ id: "prod_1", title: "Pashmina Shawl", price: 5000 }] } };
      }
      return { toolCallId: call.id, isError: false, result: { message: "Mocked success" } };
    }
  }

  const provider = createGroqProvider({ apiKey: process.env.VITE_GROQ_API_KEY! });
  const registry = new ToolRegistry();
  CommerceToolRegistrar.register(registry);

  const executor = new MockExecutor(registry) as any;

  const ai = new AIService({
    provider,
    registry,
    executor,
    systemPrompts: { customer: CUSTOMER_SYSTEM_PROMPT }
  });

  const agent = new CustomerAgent({
    dependencies: { ai, tools: registry, executor },
    defaultOptions: { temperature: 0.1 }
  });

  const prompts = [
    "I love walnut carving.",
    "My budget is ₹3000.",
    "What are my preferences?",
    "Forget my budget",
    "What do you know about me now?"
  ];

  for (const prompt of prompts) {
    console.log(`\n\n--- Prompt: "${prompt}" ---`);
    try {
      const result = await agent.chat({ role: "user", content: prompt }, { userId: "user_123", conversationId: "conv_" + Date.now() });
      if (result.success) {
        console.log(`[LLM Final Response]: ${result.data.message.content}`);
      } else {
        console.error("Agent error:", result.error);
      }
    } catch (e) {
      console.error("Caught error:", e);
    }
  }
}

runTest().catch(console.error);
