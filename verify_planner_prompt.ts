import { DecompositionPlanner } from "./src/ai/planner/decomposition.planner";
import { CUSTOMER_SYSTEM_PROMPT } from "./src/ai/prompts/customer.system";
import type { Goal, PlannerContext } from "./src/ai/planner/types";
import { AIService } from "./src/ai/services/ai.service";

async function verify() {
  let capturedRequest: any;

  // Create a mock provider to capture the final request
  const mockProvider = {
    id: "mock",
    chat: async (req: any) => {
      capturedRequest = req;
      // return dummy plan to satisfy the json parser
      return {
        message: { 
          role: "assistant", 
          content: JSON.stringify([{ id: "s1", description: "test", kind: "noop" }]) 
        },
        finishReason: "stop"
      };
    }
  };

  const ai = new AIService({
    provider: mockProvider as any,
    systemPrompts: { customer: CUSTOMER_SYSTEM_PROMPT }
  });

  const planner = new DecompositionPlanner();

  const goal: Goal = {
    id: "g1",
    audience: "customer",
    objective: "Remove the welcome hamper from my cart",
  };

  const context: PlannerContext = {
    now: () => Date.now(),
    ai,
  };

  try {
    await planner.createPlan(goal, context);
  } catch (e) {
    // ignore validation errors, we just want to see the request
  }

  const hasSystemPrompt = capturedRequest.messages.some((m: any) => m.role === "system");
  const systemMessage = capturedRequest.messages.find((m: any) => m.role === "system");
  
  if (hasSystemPrompt && systemMessage.content.includes("You must have a productId before calling add_to_cart or remove_from_cart")) {
    console.log("SUCCESS: The planner successfully received the CUSTOMER_SYSTEM_PROMPT rules.");
  } else {
    console.log("FAILURE: The planner did not receive the CUSTOMER_SYSTEM_PROMPT rules.");
    console.log("Captured Messages:");
    console.log(JSON.stringify(capturedRequest.messages, null, 2));
  }
}
verify();
