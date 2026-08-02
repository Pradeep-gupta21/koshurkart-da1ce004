import * as fs from "fs";
const envStr = fs.readFileSync(".env", "utf-8");
for (const line of envStr.split("\n")) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}
(global as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
(globalThis as any).localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
(global as any).window = globalThis;

// @ts-ignore
if (typeof process !== "undefined" && !import.meta.env) {
    // @ts-ignore
    import.meta.env = process.env;
}

import { AIService } from "./src/ai/services/ai.service";
import { CustomerAgent } from "./src/ai/agents/customer.agent";
import { createGroqProvider } from "./src/ai/providers/groq.provider";
import { ToolRegistry } from "./src/ai/tools/registry";
import { CommerceToolRegistrar } from "./src/ai/tools/commerce/registration/CommerceToolRegistrar";
import { CUSTOMER_SYSTEM_PROMPT } from "./src/ai/prompts/customer.system";
import type { ToolExecutor, ToolCall } from "./src/ai/tools/types";

class MockExecutor implements ToolExecutor<any> {
  async run(call: ToolCall): Promise<any> {
    console.log(`    -> [EXECUTOR] Executing tool: ${call.name}`, call.arguments);
    if (call.name === "search_products") {
        return { toolCallId: call.id, isError: false, result: { products: [{ id: "prod_1", title: "Pashmina Shawl", price: 5000 }] } };
    }
    if (call.name === "add_to_wishlist") {
      return { toolCallId: call.id, isError: false, result: { message: "Item added to your wishlist successfully." } };
    }
    if (call.name === "remove_from_wishlist") {
      return { toolCallId: call.id, isError: false, result: { message: "Item removed from wishlist" } };
    }
    if (call.name === "get_wishlist") {
      return { toolCallId: call.id, isError: false, result: { 
          products: [{ productId: "prod_1", title: "Pashmina Shawl", price: 5000 }],
          message: "Your wishlist has 1 item(s)."
      } };
    }
    if (call.name === "clear_wishlist") {
      return { toolCallId: call.id, isError: false, result: { message: "Your wishlist has been cleared." } };
    }
    return { toolCallId: call.id, isError: false, result: { message: "Mocked success" } };
  }
}

async function verify() {
  const provider = createGroqProvider({ apiKey: process.env.VITE_GROQ_API_KEY! });
  const registry = new ToolRegistry();
  CommerceToolRegistrar.register(registry);

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
    "What is in my wishlist?",
    "Save Pashmina shawl for later",
    "Remove prod_1 from my saved items",
    "Clear my wishlist"
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
