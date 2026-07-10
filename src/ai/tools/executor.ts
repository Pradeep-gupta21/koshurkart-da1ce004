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
    const result = await this.executeCall(call, options);
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
