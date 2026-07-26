import { AIService } from "./src/ai/services/ai.service";
import { CustomerAgent } from "./src/ai/agents/customer.agent";
import { MockProvider } from "./src/ai/providers/mock.provider";
import { ToolRegistry } from "./src/ai/tools/registry";
import { CommerceToolRegistrar } from "./src/ai/tools/commerce/registration/CommerceToolRegistrar";

async function run() {
  const registry = new ToolRegistry();
  CommerceToolRegistrar.register(registry);

  // We need a mock provider that just prints out the prompt it receives.
  // Actually, wait, we can just use Gemini with a real/mock key, or just instantiate it.
  
  // To avoid needing an API key, we will just read CUSTOMER_SYSTEM_PROMPT and see if add_to_cart is correctly in it.
  const { CUSTOMER_SYSTEM_PROMPT } = require("./src/ai/prompts/customer.system.ts");
  console.log("PROMPT HAS add_to_cart:", CUSTOMER_SYSTEM_PROMPT.includes("\`add_to_cart\`"));
}

run();
