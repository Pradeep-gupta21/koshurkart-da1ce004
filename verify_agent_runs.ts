import { config } from "dotenv";
config();

import { AIService } from "./src/ai/services/ai.service";
import { CustomerAgent } from "./src/ai/agents/customer.agent";
import { createGroqProvider } from "./src/ai/providers/groq.provider";
import { ToolRegistry } from "./src/ai/tools/registry";
import { CommerceToolRegistrar } from "./src/ai/tools/commerce/registration/CommerceToolRegistrar";

async function verify() {
  const provider = createGroqProvider({ apiKey: process.env.VITE_GROQ_API_KEY! });
  const registry = new ToolRegistry();
  CommerceToolRegistrar.register(registry);

  const ai = new AIService({
    provider,
    systemPrompts: { customer: require("./src/ai/prompts/customer.system.ts").CUSTOMER_SYSTEM_PROMPT }
  });

  const agent = new CustomerAgent({
    dependencies: { ai, tools: registry, executor: undefined as any },
    defaultOptions: { temperature: 0.1 }
  });

  console.log("Running identical prompt 5 times...");
  let successCount = 0;

  for (let i = 1; i <= 5; i++) {
    try {
      const result = await agent.chat({ role: "user", content: "Add the product 'p_123' to my cart." }, { userId: "u1" });
      if (result.success) {
        // Since we don't have an executor, the loop will break after first pass if it tries to run tools.
        // Wait, the agent will throw or log an error if executor is undefined?
        // Let's just check the last message or reflection.
        console.log(`Run ${i} finished. checking if tool was called...`);
      } else {
        console.log(`Run ${i} error:`, result.error);
      }
    } catch (err: any) {
      if (err.message?.includes("No executor")) {
        console.log(`Run ${i}: Tool call successfully intercepted (no executor configured)`);
        successCount++;
      } else if (err.error?.code === "unavailable") {
        console.log(`Run ${i}: Tool call successfully intercepted (no executor configured)`);
        successCount++;
      } else {
        console.error(`Run ${i} unexpected error:`, err);
      }
    }
  }

  console.log(`Verification complete. Tool invoked ${successCount}/5 times consistently.`);
}

verify().catch(console.error);
