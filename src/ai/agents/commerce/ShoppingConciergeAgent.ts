import { AIService } from "@/ai/services/ai.service";
import type { ToolExecutor, ToolRegistry } from "@/ai/tools";
import type { ChatAudience, ChatMessage, ToolCall } from "@/ai/types/chat";

export interface ConciergePlanStep {
  step: number;
  tool: string;
  reason: string;
  dependsOn: number[];
}

export interface ConciergePlan {
  steps: ConciergePlanStep[];
}

/**
 * ShoppingConciergeAgent
 * Acts as a Master Orchestrator for complex shopping requests.
 * It determines required tools, executes them in order, merges results,
 * and generates a single customer-friendly answer.
 */
export class ShoppingConciergeAgent {
  constructor(
    private readonly ai: AIService,
    private readonly registry: ToolRegistry,
    private readonly executor: ToolExecutor,
  ) {}

  async execute(userRequest: string, sharedContext: Record<string, any> = {}): Promise<string> {
    // 1. Generate Execution Plan
    const availableTools = this.registry.list().map((t) => ({
      name: t.name,
      description: t.description,
    }));

    const planningPrompt = `
You are the Shopping Concierge Master Orchestrator.
Given the customer request, create an execution plan to satisfy it using the available tools.
Skip unnecessary tools.
Available tools:
${JSON.stringify(availableTools, null, 2)}

Customer Request: "${userRequest}"

Respond ONLY with a JSON object representing the plan:
{
  "steps": [
    {
      "step": 1,
      "tool": "tool_name",
      "reason": "Why this tool is needed",
      "dependsOn": []
    }
  ]
}
`;

    const planResponse = await this.ai.chat({
      messages: [{ role: "user", content: planningPrompt }],
      options: { responseFormat: { type: "json_object" } },
    });

    if (!planResponse.message || !planResponse.message.content) {
      return "Failed to generate a plan for the request.";
    }

    let plan: ConciergePlan;
    try {
      plan = JSON.parse(planResponse.message.content) as ConciergePlan;
    } catch (e) {
      return "Failed to parse the execution plan.";
    }

    // 2. Execute tools sequentially maintaining shared context
    const results: Record<string, any> = {};

    for (const step of plan.steps) {
      const tool = this.registry.get(step.tool);
      if (!tool) {
        results[step.tool] = { error: `Tool ${step.tool} not found` };
        continue;
      }

      // Generate tool arguments dynamically based on the shared context and request
      const argsPrompt = `
You need to call the tool "${step.tool}".
The tool description: ${tool.description}
The customer request is: "${userRequest}"

Here is the shared context from previous steps:
${JSON.stringify(sharedContext, null, 2)}

What JSON arguments should be passed to ${step.tool}?
Respond ONLY with a JSON object containing the arguments.
`;

      const argsResponse = await this.ai.chat({
        messages: [{ role: "user", content: argsPrompt }],
        options: { responseFormat: { type: "json_object" } },
      });

      let args = {};
      try {
        args = JSON.parse(argsResponse.message?.content || "{}");
      } catch (e) {
        // Fallback to empty args
      }

      // Execute tool
      const toolResult = await this.executor.execute(step.tool, args);
      
      const stepOutput = toolResult.ok ? toolResult.data : { error: toolResult.error?.message };
      results[step.tool] = stepOutput;

      // Update shared context with this tool's result
      sharedContext[step.tool] = stepOutput;
    }

    // 3. Result Fusion (Merge outputs into one structured response)
    const fusionPrompt = `
You are the Shopping Concierge. 
The customer asked: "${userRequest}"

We executed multiple tools to satisfy this request. 
Here are the results of the tool executions:
${JSON.stringify(results, null, 2)}

Merge these outputs into one structured, highly helpful, and customer-friendly response.
Include recommendations, reasons, reviews, savings, shipping estimates, and checkout summaries if applicable.
Do not mention the tool names to the customer.
`;

    const finalResponse = await this.ai.chat({
      messages: [{ role: "user", content: fusionPrompt }],
    });

    return finalResponse.message?.content || "Could not generate final response.";
  }
}
