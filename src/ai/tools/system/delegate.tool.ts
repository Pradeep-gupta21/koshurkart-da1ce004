import { BaseTool } from "../base.tool";
import type { ToolContext, ToolResult } from "../types";
import { ok, err } from "../types";
import type { ChatAudience } from "@/ai/types/chat";
import { isAgentOk } from "@/ai/agents/types";

/**
 * KoshurKart — DelegateTaskTool
 * =================================================================
 * A system-level tool that allows one agent to delegate a task to
 * another specialized agent (customer, vendor, admin).
 * 
 * It requires `AgentRegistry` to be injected into the context services
 * under `services.agents`.
 */

export type DelegateTaskInput = {
  targetAudience: ChatAudience;
  objective: string;
  [key: string]: unknown;
};

export class DelegateTaskTool<
  TServices extends { agents?: any; [key: string]: unknown } = any
> extends BaseTool<DelegateTaskInput, string, TServices> {
  readonly name = "delegate_task";
  readonly description = "Delegates a complex task or question to another specialized agent (customer, vendor, admin). Use this to fetch information or execute actions outside your own capabilities.";
  readonly audiences = undefined; // Available to all agents
  readonly requiresConfirmation = false;

  readonly parameters = {
    type: "object" as const,
    properties: {
      targetAudience: {
        type: "string" as const,
        description: "The specialized agent to delegate to (customer, vendor, admin).",
        enum: ["customer", "vendor", "admin"]
      },
      objective: {
        type: "string" as const,
        description: "A clear, detailed description of what the target agent needs to do or answer."
      }
    },
    required: ["targetAudience", "objective"]
  };

  protected async run(
    input: DelegateTaskInput,
    context: ToolContext<TServices>
  ): Promise<ToolResult<string>> {
    // 1. Locate the registry
    const registry = context.services?.agents;
    if (!registry) {
      return err({
        code: "execution_error",
        message: "DelegateTaskTool requires an AgentRegistry injected at context.services.agents.",
        retryable: false
      });
    }

    // 2. Fetch the target agent
    const targetAgent = registry.getByAudience(input.targetAudience);
    if (!targetAgent) {
      return err({
        code: "invalid_input",
        message: `No agent found for audience "${input.targetAudience}".`,
        retryable: false
      });
    }

    // 3. Cycle detection via delegation chain
    const chain: string[] = [...(context.delegationChain ?? []), context.audience];

    if (chain.includes(input.targetAudience)) {
      const cyclePath = [...chain, input.targetAudience].join(" → ");
      return err({
        code: "invalid_input",
        message: `Delegation cycle detected: ${cyclePath}. Aborting to prevent infinite loop.`,
        retryable: false
      });
    }

    // 4. Delegate the objective, forwarding the extended chain
    context.logger?.debug(`Delegating task to ${input.targetAudience} agent: ${input.objective}`);

    const agentResult = await targetAgent.chat(input.objective, {
      userId: context.userId,
      conversationId: context.conversationId,
      signal: context.signal,
      metadata: {
        ...(context.metadata ?? {}),
        delegationChain: chain,
      },
    });

    if (isAgentOk(agentResult)) {
      return ok(agentResult.response.message.content);
    } else {
      return err({
        code: "execution_error",
        message: `Delegation failed: ${agentResult.error.message}`,
        retryable: agentResult.error.retryable,
      });
    }
  }
}
