import { z } from "zod";
import { BasePlanner, type BasePlannerConfig } from "./base.planner";
import { validatePlan } from "./validator";
import type {
  Goal,
  Plan,
  PlannerContext,
  PlanStep,
  PlanValidationIssue,
} from "./types";

/**
 * KoshurKart — DecompositionPlanner
 * =================================================================
 * An AI-driven planner that dynamically decomposes a goal into a Directed 
 * Acyclic Graph (DAG) of steps. 
 *
 * It uses the injected `AIService` to reason about the goal, reading the
 * injected `ToolRegistry` to understand what actions are possible.
 * It strictly validates the AI's output using Zod and the framework's 
 * `validatePlan` utility, automatically retrying once if the AI hallucinates 
 * invalid dependencies or unregistered tools.
 */

// Schema mapping the expected JSON from the model
const PlanStepSchema = z.object({
  id: z.string().min(1, "id is required"),
  description: z.string().min(1, "description is required"),
  kind: z.enum(["tool", "reason", "decision", "noop"]),
  toolName: z.string().optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  dependsOn: z.array(z.string()).optional(),
});

const PlanSchema = z.array(PlanStepSchema);

export class DecompositionPlanner<
  TServices extends Record<string, unknown> = Record<string, unknown>,
> extends BasePlanner<TServices> {
  readonly id = "decomposition";

  constructor(config?: BasePlannerConfig) {
    super(config);
  }

  async createPlan(
    goal: Goal,
    context: PlannerContext<TServices>,
  ): Promise<Plan> {
    if (!context.ai) {
      throw new Error(
        "DecompositionPlanner requires an AIService injected via PlannerContext.",
      );
    }

    const availableTools = context.tools
      ? context.tools.toDefinitions(goal.audience)
      : [];

    let attempt = 1;
    const maxAttempts = 2;
    let validationFeedback = "";

    const ts = this.now(context);
    const planId = this.generateId();

    while (attempt <= maxAttempts) {
      const prompt = this.buildPrompt(goal, availableTools, validationFeedback);

      let chatRes;
      try {
        chatRes = await context.ai.chat({
          audience: goal.audience,
          systemPrompt: prompt,
          messages: [
            { id: "gen-1", role: "user", content: "Generate the plan JSON.", createdAt: Date.now() }
          ],
        });
      } catch (err: any) {
        throw new Error(`AI generation failed: ${err.message}`);
      }

      // Parse JSON from the model output
      let rawJson;
      try {
        const text = chatRes.message.content.trim();
        // Sometime models wrap JSON in markdown blocks even with json_object format
        const cleanText = text.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "");
        rawJson = JSON.parse(cleanText);
      } catch (err) {
        if (attempt >= maxAttempts) {
          throw new Error("AI returned invalid JSON that could not be parsed.");
        }
        validationFeedback = "The previous response was not valid JSON. Please return ONLY a JSON array.";
        attempt++;
        continue;
      }

      // Validate schema with Zod
      const parseResult = PlanSchema.safeParse(rawJson);
      if (!parseResult.success) {
        if (attempt >= maxAttempts) {
          throw new Error(`AI returned JSON that did not match the required schema: ${parseResult.error.message}`);
        }
        validationFeedback = `The previous JSON did not match the schema. Zod errors: ${parseResult.error.message}`;
        attempt++;
        continue;
      }

      // Build the draft plan
      const steps = parseResult.data.map((s) => ({
        id: s.id,
        description: s.description,
        kind: s.kind,
        toolName: s.toolName,
        input: s.input,
        dependsOn: s.dependsOn ?? [],
        maxAttempts: s.kind === "tool" ? 2 : 1, // slight default resilience for tools
        status: "pending" as const,
        attempts: 0,
      })) as PlanStep[];

      const draftPlan: Plan = {
        id: planId,
        goal,
        steps,
        status: "draft",
        createdAt: ts,
        updatedAt: ts,
      };

      // Perform deep framework validation (cycles, unregistered tools, self-dependencies)
      const validation = validatePlan(draftPlan, { registry: context.tools });
      if (validation.valid) {
        return draftPlan;
      }

      // If invalid and out of attempts, throw to fail the plan
      if (attempt >= maxAttempts) {
        const errorMsg = validation.issues
          .filter((i) => i.severity === "error")
          .map((i) => i.message)
          .join("; ");
        throw new Error(`Plan validation failed after ${maxAttempts} attempts: ${errorMsg}`);
      }

      // Accumulate feedback for the retry
      validationFeedback = this.formatValidationIssues(validation.issues);
      attempt++;
    }

    throw new Error("Unreachable");
  }

  private buildPrompt(
    goal: Goal,
    tools: Array<{ name: string; description: string }>,
    validationFeedback: string,
  ): string {
    return `
You are an expert AI task planner for KoshurKart (an autonomous AI operating system).
Your job is to break down the given goal into a Directed Acyclic Graph (DAG) of execution steps.

GOAL OBJECTIVE: ${goal.objective}
AUDIENCE SURFACE: ${goal.audience}
${goal.constraints && goal.constraints.length > 0 ? `CONSTRAINTS: ${goal.constraints.join(", ")}` : ""}
${goal.inputs ? `INPUTS: ${JSON.stringify(goal.inputs)}` : ""}

AVAILABLE TOOLS:
${tools.length === 0 ? "None." : tools.map((t) => `- ${t.name}: ${t.description}`).join("\n")}

${validationFeedback ? `\nWARNING - PREVIOUS ATTEMPT FAILED WITH ERRORS:\n${validationFeedback}\nFix these issues in your next response.\n` : ""}

INSTRUCTIONS:
1. Decompose the goal into logical steps.
2. If an action requires a tool, use kind="tool" and specify the "toolName". NEVER invent or hallucinate tool names. Only use from the AVAILABLE TOOLS list.
3. If an action requires reasoning/computation but no tool, use kind="reason".
4. Steps can depend on each other. Use "dependsOn" array with the "id" of the prerequisite steps.
5. Do NOT create circular dependencies (e.g. A depends on B, B depends on A).
6. Return ONLY a JSON array of steps matching this schema:
[
  {
    "id": "unique_step_id",
    "description": "What this step does",
    "kind": "tool" | "reason" | "decision" | "noop",
    "toolName": "name_of_tool", // ONLY IF kind="tool"
    "input": { ... }, // Arguments for the tool (optional)
    "dependsOn": ["other_step_id"] // Prerequisites (optional)
  }
]
    `.trim();
  }

  private formatValidationIssues(issues: PlanValidationIssue[]): string {
    const errors = issues.filter((i) => i.severity === "error");
    return errors.map((e) => `- ${e.code}: ${e.message} (Step: ${e.stepId || 'N/A'})`).join("\n");
  }

  private generateId(): string {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

/** Factory to create a DecompositionPlanner */
export function createDecompositionPlanner<
  TServices extends Record<string, unknown> = Record<string, unknown>,
>(config?: BasePlannerConfig): DecompositionPlanner<TServices> {
  return new DecompositionPlanner<TServices>(config);
}
