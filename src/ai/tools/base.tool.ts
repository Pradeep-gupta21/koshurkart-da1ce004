/**
 * KoshurKart — BaseTool
 * =================================================================
 * Abstract base class that implements the shared plumbing every `Tool`
 * (see src/ai/tools/types.ts) needs, so concrete tools only have to
 * declare their schema and implement `run()`.
 *
 * What the base provides:
 *  - `toDefinition()` derived from the tool's own `name`/`description`/
 *    `parameters`, so a subclass never hand-writes the protocol shape.
 *  - `execute()` — a safe wrapper around the subclass's `run()` that:
 *      • optionally validates arguments via `validate()`,
 *      • honors an already-aborted `signal` up front,
 *      • catches any unexpected throw and normalizes it to a failed
 *        `ToolResult` (so a buggy tool can never crash a planner/agent).
 *
 * It is deliberately provider-neutral: NO network, NO API keys, NO vendor
 * SDKs, NO concrete data source. Real tools extend this and read their
 * dependencies from the injected `ToolContext`.
 */

import type { JSONSchema, ToolDefinition, ChatAudience } from "@/ai/types/chat";
import type {
  Tool,
  ToolContext,
  ToolResult,
} from "./types";
import { err } from "./types";

export abstract class BaseTool<
  TInput = Record<string, unknown>,
  TOutput = unknown,
  TServices extends Record<string, unknown> = Record<string, unknown>,
> implements Tool<TInput, TOutput, TServices>
{
  /** Machine name the model/planner uses to call the tool. */
  abstract readonly name: string;
  /** Short description telling a model when to use the tool. */
  abstract readonly description: string;
  /** JSON-Schema describing the tool's arguments. */
  abstract readonly parameters: JSONSchema;

  /**
   * Audiences allowed to call this tool. Default `undefined` (unrestricted);
   * subclasses override with a narrower list when a tool is scoped.
   */
  readonly audiences?: readonly ChatAudience[];

  /**
   * Emit the provider-facing declaration. Concrete tools rarely need to
   * override this — it is composed from the tool's own fields.
   */
  toDefinition(): ToolDefinition {
    return {
      name: this.name,
      description: this.description,
      parameters: this.parameters,
    };
  }

  /**
   * Public entry point. Wraps the subclass's `run()` with validation,
   * abort-awareness, and error normalization. Callers (and the
   * `ToolExecutor`) should invoke this, never `run()` directly.
   */
  async execute(
    input: TInput,
    context: ToolContext<TServices>,
  ): Promise<ToolResult<TOutput>> {
    // Bail immediately if the caller already cancelled.
    if (context.signal?.aborted) {
      return err<TOutput>(
        {
          code: "timeout",
          message: `Tool "${this.name}" aborted before execution.`,
          retryable: true,
        },
      );
    }

    // Optional argument validation. A returned string is treated as the
    // validation failure message; `null`/`undefined` means "valid".
    const validationError = this.validate(input);
    if (validationError) {
      return err<TOutput>(
        {
          code: "invalid_input",
          message: validationError,
          retryable: false,
        },
      );
    }

    try {
      return await this.run(input, context);
    } catch (caught) {
      return err<TOutput>(this.normalizeThrow(caught));
    }
  }

  /* -------------------------------------------------------------- *
   * Extension points
   * -------------------------------------------------------------- */

  /**
   * The actual tool logic. Subclasses implement this and return a
   * `ToolResult`. They should return a failed result for *expected*
   * failures; only unexpected errors need to throw (the base catches them).
   */
  protected abstract run(
    input: TInput,
    context: ToolContext<TServices>,
  ): Promise<ToolResult<TOutput>>;

  /**
   * Optional argument validation hook. Return a human-readable message to
   * reject the input, or `null` (the default) to accept it. Subclasses can
   * override to add lightweight checks without pulling in a schema library.
   */
  protected validate(_input: TInput): string | null {
    return null;
  }

  /* -------------------------------------------------------------- *
   * Internals
   * -------------------------------------------------------------- */

  /** Coerce an unknown thrown value into a normalized tool error object. */
  private normalizeThrow(caught: unknown) {
    const isAbort = caught instanceof Error && caught.name === "AbortError";
    const message =
      caught instanceof Error ? caught.message : String(caught);
    return {
      code: isAbort ? ("timeout" as const) : ("execution_error" as const),
      message: `Tool "${this.name}" failed: ${message}`,
      retryable: isAbort,
      cause: caught,
    };
  }
}
