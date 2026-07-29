import * as fs from "fs";
const envStr = fs.readFileSync(".env", "utf-8");
for (const line of envStr.split("\n")) {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}


import { AIService } from "./src/ai/services/ai.service";
import { CustomerAgent } from "./src/ai/agents/customer.agent";
import { createGroqProvider } from "./src/ai/providers/groq.provider";
import { ToolRegistry } from "./src/ai/tools/registry";
import { CommerceToolRegistrar } from "./src/ai/tools/commerce/registration/CommerceToolRegistrar";
import { CUSTOMER_SYSTEM_PROMPT } from "./src/ai/prompts/customer.system";
import type { ToolExecutor, ToolCall, ToolResult } from "./src/ai/tools/types";

class MockExecutor implements ToolExecutor<any> {
  async run(call: ToolCall): Promise<any> {
    console.log(`    -> [EXECUTOR] Executing tool: ${call.name}`, call.arguments);
    if (call.name === "get_orders") {
      return { toolCallId: call.id, isError: false, result: { orders: [{ id: "order_123", status: "shipped" }], message: "Found 1 order" } };
    }
    if (call.name === "track_order") {
      return { toolCallId: call.id, isError: false, result: { trackingEvents: [{ status: "shipped" }], message: "Order tracking retrieved successfully." } };
    }
    if (call.name === "cancel_order") {
      return { toolCallId: call.id, isError: false, result: { message: "Order cancelled successfully." } };
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
    "Show my orders",
    "Track my last order",
    "Cancel my last order",
    "Where is my package?",
    "Has my order shipped?",
    "Show order history."
  ];

  for (const prompt of prompts) {
    console.log(`\n\n--- Prompt: "${prompt}" ---`);
    try {
      // Simulate intent detection step (mock output to show the intent before the agent handles it)
      console.log(`[Intent Detection] Simulated mapping: order_management`);
      
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
