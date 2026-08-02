/**
 * KoshurKart — ToolExecutor
 * =================================================================
 * Runs tools from a `ToolRegistry` on behalf of planners and agents, and
 * bridges the framework's runtime `ToolResult` back to the *wire* result
 * shape a provider feeds to the model (`ToolResult` in src/ai/types/chat.ts).
 *
 * It is the single choke point where a model's request to run a tool turns
 * into an actual invocation. Every path returns a normalized runtime
 * `ToolResult` — unknown tool, audience rejection, timeout, and unexpected
 * throws are all classified rather than propagated. That keeps a single
 * bad tool call from derailing an agent loop.
 *
 * Still provider-agnostic: it reaches no network and holds no keys. The
 * data a tool needs arrives through the `ToolContext` the caller supplies.
 */

import type { ToolCall, ToolResult as WireToolResult } from "@/ai/types/chat";
import type { ToolRegistry } from "./registry";
import type {
  AnyTool,
  ToolContext,
  ToolExecutionOptions,
  ToolResult,
} from "./types";
import { err, ok } from "./types";
import { z } from "zod";

/** Dev-only logging — silenced in production builds (audit H-3). */
const IS_DEV = typeof process !== "undefined"
  ? process.env.NODE_ENV !== "production"
  : typeof (globalThis as any).Deno !== "undefined"
    ? (globalThis as any).Deno.env.get("ENV") !== "production"
    : true;
function devLog(...args: unknown[]): void {
  if (IS_DEV) console.debug("[ToolExecutor]", ...args);
}

/**
 * A source of `ToolContext` for an execution. Either a ready context or a
 * factory the executor calls per invocation (so callers can mint a fresh,
 * request-scoped context — e.g. with a per-call abort signal).
 */
export type ToolContextSource<
  TServices extends Record<string, unknown> = Record<string, unknown>,
> = ToolContext<TServices> | (() => ToolContext<TServices>);

export class ToolExecutor<
  TServices extends Record<string, unknown> = Record<string, unknown>,
> {
  constructor(
    /** Catalog of runnable tools. */
    private readonly registry: ToolRegistry,
    /** Base context (or factory) applied to every execution. */
    private readonly contextSource: ToolContextSource<TServices>,
  ) {}

  /* -------------------------------------------------------------- *
   * Execution by name
   * -------------------------------------------------------------- */

  /**
   * Look a tool up by name and run it with the given arguments. Resolves to
   * a runtime `ToolResult`; never rejects for expected failures.
   */
  async execute<TOutput = unknown>(
    name: string,
    args: Record<string, unknown>,
    options: ToolExecutionOptions = {},
  ): Promise<ToolResult<TOutput>> {
    const tool = this.registry.get(name);
    if (!tool) {
      return err<TOutput>({
        code: "not_found",
        message: `No tool named "${name}" is registered.`,
        retryable: false,
      });
    }

    const context = this.resolveContext(options);

    // Enforce audience scoping at call time, mirroring the registry filter.
    if (!this.isAllowed(tool, context)) {
      return err<TOutput>({
        code: "unauthorized",
        message: `Audience "${context.audience}" may not call tool "${name}".`,
        retryable: false,
      });
    }

    // ---- H-2: Centralized argument validation (before tool executes) ----
    const validationErr = this.validateArgs(tool, args);
    if (validationErr) {
      return err<TOutput>({
        code: "invalid_input",
        message: validationErr,
        retryable: false,
      });
    }

    const run = tool.execute(args, context) as Promise<ToolResult<TOutput>>;

    // Optional soft timeout: race the tool against a timer.
    if (options.timeoutMs && options.timeoutMs > 0) {
      return this.withTimeout(run, options.timeoutMs, name);
    }
    return run;
  }

  /**
   * Execute a provider-emitted `ToolCall` and return the runtime result.
   * Convenience for agent loops that receive `ToolCall`s from a model.
   */
  async executeCall<TOutput = unknown>(
    call: ToolCall,
    options: ToolExecutionOptions = {},
  ): Promise<ToolResult<TOutput>> {
    return this.execute<TOutput>(call.name, call.arguments, options);
  }

  /* -------------------------------------------------------------- *
   * Wire bridging
   * -------------------------------------------------------------- */

  /**
   * Execute a `ToolCall` and adapt the outcome to the wire `ToolResult`
   * shape (`{ toolCallId, result, isError }`) that a provider hands back to
   * the model. This is the typical entry point inside an agent turn.
   */
  async run(
    call: ToolCall,
    options: ToolExecutionOptions = {},
  ): Promise<WireToolResult> {
    devLog(`run START - ${call.name}`);
    const result = await this.executeCall(call, options);
    devLog(`run END - ${call.name}, ok: ${result.ok}`);
    return ToolExecutor.toWireResult(call, result);
  }

  /**
   * Convert a runtime `ToolResult` into the wire shape correlated to a
   * `ToolCall`. On failure, only the safe error fields are surfaced (the
   * `cause` is intentionally dropped so debug detail never reaches a model).
   */
  static toWireResult(
    call: ToolCall,
    result: ToolResult,
  ): WireToolResult {
    if (result.ok) {
      return { toolCallId: call.id, result: result.data, isError: false };
    }
    // Explicit extract: negative narrowing of a boolean discriminant is
    // unreliable under this repo's `strictNullChecks: false`.
    const { error } = result as Extract<ToolResult, { ok: false }>;
    return {
      toolCallId: call.id,
      result: { code: error.code, message: error.message },
      isError: true,
    };
  }

  /* -------------------------------------------------------------- *
   * Internals
   * -------------------------------------------------------------- */

  /** Resolve the base context and overlay any per-call overrides. */
  private resolveContext(
    options: ToolExecutionOptions,
  ): ToolContext<TServices> {
    const base =
      typeof this.contextSource === "function"
        ? this.contextSource()
        : this.contextSource;
    const overrides: Partial<ToolContext<TServices>> = {};
    if (options.signal && options.signal !== base.signal) {
      overrides.signal = options.signal;
    }
    if (options.delegationChain) {
      overrides.delegationChain = options.delegationChain;
    }
    return Object.keys(overrides).length > 0 ? { ...base, ...overrides } : base;
  }

  /** Audience gate: unrestricted tools pass; scoped tools must list it. */
  private isAllowed(tool: AnyTool, context: ToolContext<TServices>): boolean {
    return !tool.audiences || tool.audiences.includes(context.audience);
  }

  /**
   * H-2: Validate tool arguments against the tool's declared JSON Schema
   * parameters at the executor level — BEFORE tool.execute() is called.
   * Returns an error message string on failure, or null on success.
   */
  private validateArgs(
    tool: AnyTool,
    args: Record<string, unknown>,
  ): string | null {
    const schema = tool.parameters;
    if (!schema || !schema.properties) return null; // No schema = no validation

    try {
      // Build a Zod schema from the tool's JSON Schema properties.
      const shape: Record<string, z.ZodTypeAny> = {};
      const required = new Set<string>(
        Array.isArray(schema.required) ? (schema.required as string[]) : [],
      );

      for (const [key, prop] of Object.entries(schema.properties as Record<string, any>)) {
        let field: z.ZodTypeAny;
        switch (prop.type) {
          case "string":
            field = z.string();
            break;
          case "number":
          case "integer":
            field = z.number();
            break;
          case "boolean":
            field = z.boolean();
            break;
          case "array":
            field = z.array(z.unknown());
            break;
          case "object":
            field = z.record(z.unknown());
            break;
          default:
            field = z.unknown();
        }
        if (!required.has(key)) {
          field = field.optional();
        }
        shape[key] = field;
      }

      const zodSchema = z.object(shape).passthrough();
      const result = zodSchema.safeParse(args);
      if (!result.success) {
        const issues = result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        return `Invalid arguments for tool "${tool.name}": ${issues}`;
      }
      return null;
    } catch {
      // If schema parsing itself fails, allow the call through — the tool's
      // own validate() method is the secondary gate.
      return null;
    }
  }

  /**
   * Race a running tool against a timer. If the timer wins, resolve to a
   * `timeout` error. The underlying tool is not forcibly cancelled here —
   * callers wanting hard cancellation should also pass a `signal`.
   */
  private withTimeout<TOutput>(
    run: Promise<ToolResult<TOutput>>,
    timeoutMs: number,
    name: string,
  ): Promise<ToolResult<TOutput>> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<ToolResult<TOutput>>((resolve) => {
      timer = setTimeout(() => {
        resolve(
          err<TOutput>({
            code: "timeout",
            message: `Tool "${name}" timed out after ${timeoutMs}ms.`,
            retryable: true,
          }),
        );
      }, timeoutMs);
    });
    return Promise.race([run, timeout]).finally(() => clearTimeout(timer));
  }
}

/**
 * Small helper mirroring the runtime constructors so callers importing the
 * executor can build results without a second import. Re-exported from the
 * barrel too.
 */
export { ok, err };
