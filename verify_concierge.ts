import { AIService } from "./src/ai/services/ai.service";
import { ToolExecutor } from "./src/ai/tools/executor";
import { ToolRegistry } from "./src/ai/tools/registry";
import { CommerceToolRegistrar } from "./src/ai/tools/commerce/registration/CommerceToolRegistrar";
import { ShoppingConciergeAgent } from "./src/ai/agents/commerce/ShoppingConciergeAgent";

// A mock provider for testing
const mockProvider = {
  id: "mock",
  async generate(req: any) {
    const content = req.messages[req.messages.length - 1].content;
    
    // Simulate Plan Generation
    if (content.includes("Respond ONLY with a JSON object representing the plan")) {
      return {
        message: {
          role: "assistant",
          content: JSON.stringify({
            steps: [
              { step: 1, tool: "search_products", reason: "Find product", dependsOn: [] },
              { step: 2, tool: "estimate_delivery", reason: "Check shipping", dependsOn: [1] }
            ]
          })
        }
      };
    }
    
    // Simulate arguments generation for search_products
    if (content.includes("What JSON arguments should be passed to search_products")) {
      return {
        message: {
          role: "assistant",
          content: JSON.stringify({ query: "walnut carving", maxPrice: 3000 })
        }
      };
    }
    
    // Simulate arguments generation for estimate_delivery
    if (content.includes("What JSON arguments should be passed to estimate_delivery")) {
      return {
        message: {
          role: "assistant",
          content: JSON.stringify({ pincode: "190001", shippingMethod: "standard" })
        }
      };
    }
    
    // Simulate Fusion
    if (content.includes("Merge these outputs into one structured")) {
      return {
        message: {
          role: "assistant",
          content: "Here is your walnut carving recommendation under 3000, estimated to arrive in 3 days."
        }
      };
    }
    
    return {
      message: { role: "assistant", content: "{}" }
    };
  }
};

async function verify() {
  console.log("=== Starting Concierge Verification ===");

  const registry = new ToolRegistry();
  CommerceToolRegistrar.register(registry);
  
  // Using an empty/dummy context for test
  const executor = new ToolExecutor(registry, () => ({
    userId: "test_user",
    sessionId: "test_session",
    audience: "customer"
  } as any));

  const ai = new AIService({ provider: mockProvider as any });
  
  const concierge = new ShoppingConciergeAgent(ai, registry, executor);

  try {
    console.log("Testing full orchestration logic...");
    const result = await concierge.execute("I want a walnut carving under 3000 that arrives before Friday.");
    
    console.log("Verification success. Final merged response:");
    console.log(result);

    if (result.includes("walnut carving recommendation")) {
      console.log("PASSED: Concierge generated the correct fused response.");
    } else {
      console.log("FAILED: Expected specific phrase in response.");
    }
  } catch (error) {
    console.error("Verification failed with error:", error);
  }
}

verify();
