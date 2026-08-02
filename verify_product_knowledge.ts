import * as fs from "fs";
const envStr = fs.readFileSync(".env", "utf-8");
for (const line of envStr.split("\n")) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}
(globalThis as any).import = { meta: { env: process.env } };
(global as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

import type { ToolExecutor, ToolCall } from "./src/ai/tools/types";

class MockExecutor implements ToolExecutor<any> {
  async run(call: ToolCall): Promise<any> {
    console.log(`    -> [EXECUTOR] Executing tool: ${call.name}`, call.arguments);
    if (call.name === "product_knowledge") {
      return { 
        toolCallId: call.id, 
        isError: false, 
        result: {
          query: call.arguments.query,
          knowledgeFound: true,
          results: [{
            productName: "Premium Pashmina Shawl",
            category: "pashmina",
            description: "A beautiful handwoven Pashmina shawl from Kashmir.",
            artisanInformation: {
              vendorName: "Kashmir Looms",
              regionOfOrigin: "Kashmir"
            },
            pricing: {
              price: 15000,
              discountPrice: 12000,
              hasDiscount: true
            },
            availability: {
              stock: 10,
              inStock: true,
              lowStockThreshold: 2
            },
            reputation: {
              rating: 4.8,
              reviewCount: 45
            },
            tags: ["shawl", "pashmina", "handmade", "authentic"],
            materials: "Refer to description and tags for specific materials.",
            craftsmanship: "Authentic Kashmiri craftsmanship.",
            careInstructions: "Refer to description for specific care instructions.",
            authenticity: "100% Authentic."
          }]
        } 
      };
    }
    return { toolCallId: call.id, isError: false, result: { message: "Mocked success" } };
  }
}

async function verify() {
  const { AIService } = await import("./src/ai/services/ai.service");
  const { CustomerAgent } = await import("./src/ai/agents/customer.agent");
  const { createGroqProvider } = await import("./src/ai/providers/groq.provider");
  const { ToolRegistry } = await import("./src/ai/tools/registry");
  const { CommerceToolRegistrar } = await import("./src/ai/tools/commerce/registration/CommerceToolRegistrar");
  const { CUSTOMER_SYSTEM_PROMPT } = await import("./src/ai/prompts/customer.system");

  const provider = createGroqProvider({ apiKey: process.env.VITE_GROQ_API_KEY! });
  const registry = new ToolRegistry();
  
  // 1. Tool registration check
  CommerceToolRegistrar.register(registry);
  const pkTool = registry.get("product_knowledge");
  if (!pkTool) {
    console.error("ERROR: product_knowledge tool is missing from registry.");
  } else {
    console.log("SUCCESS: product_knowledge tool found in registry.");
  }

  const ai = new AIService({
    provider,
    registry,
    executor: new MockExecutor(),
    systemPrompts: { customer: CUSTOMER_SYSTEM_PROMPT }
  });

  const agent = new CustomerAgent({
    dependencies: { ai, tools: registry, executor: new MockExecutor() },
    defaultOptions: { temperature: 0.1 }
  });

  const prompts = [
    "What is Pashmina?",
    "Tell me about Kashmiri saffron.",
    "Is this authentic?"
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

verify().catch(console.error);
