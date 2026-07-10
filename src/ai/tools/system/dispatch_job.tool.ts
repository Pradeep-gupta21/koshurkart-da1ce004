import { BaseTool } from "../base.tool";
import type { ToolContext, ToolResult } from "../types";
import { ok, err } from "../types";
import type { ChatAudience } from "@/ai/types/chat";
import type { JobStore } from "@/ai/jobs";

/**
 * Payload interface for standard agent tasks.
 */
export interface AgentTaskPayload {
  targetAudience: ChatAudience;
  objective: string;
  userId?: string;
  conversationId?: string;
  sessionId?: string;
}

export interface DispatchJobInput {
  targetAudience: ChatAudience;
  objective: string;
  [key: string]: unknown;
}

export class DispatchJobTool<
  TServices extends { jobs?: JobStore; [key: string]: unknown } = any
> extends BaseTool<DispatchJobInput, string, TServices> {
  readonly name = "dispatch_background_task";
  readonly description = "Dispatches a complex or long-running task to another specialized agent (customer, vendor, admin) in the background. Use this when the task might take a long time and you do not need the immediate textual response. Returns a job ID.";
  readonly audiences = undefined;
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
        description: "A clear, detailed description of what the target agent needs to do."
      }
    },
    required: ["targetAudience", "objective"]
  };

  protected async run(
    input: DispatchJobInput,
    context: ToolContext<TServices>
  ): Promise<ToolResult<string>> {
    const store = context.services?.jobs;
    if (!store) {
      return err({
        code: "execution_error",
        message: "DispatchJobTool requires a JobStore injected at context.services.jobs.",
        retryable: false
      });
    }

    if (context.audience === input.targetAudience) {
      return err({
        code: "invalid_input",
        message: `Agent cannot dispatch a background task to itself (${input.targetAudience}).`,
        retryable: false
      });
    }

    const payload: AgentTaskPayload = {
      targetAudience: input.targetAudience,
      objective: input.objective,
      userId: context.userId,
      conversationId: context.conversationId,
    };

    try {
      const jobId = await store.enqueue("agent_task", payload);
      context.logger?.debug(`Dispatched background task to ${input.targetAudience} agent: Job ID ${jobId}`);
      return ok(`Background task dispatched successfully. Job ID: ${jobId}`);
    } catch (error: any) {
      return err({
        code: "execution_error",
        message: `Failed to dispatch background task: ${error.message}`,
        retryable: true
      });
    }
  }
}
