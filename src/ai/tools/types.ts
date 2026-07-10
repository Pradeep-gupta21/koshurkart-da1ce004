/**
 * KoshurKart — AI tool framework types
 * =================================================================
 * Provider-agnostic type foundation for the *tool layer* — the seam
 * that lets the AI call into the application to fetch data or take an
 * action, then feed the result back to the model.
 *
 * This file defines the runtime contract for tools: what a `Tool` is,
 * the `ToolContext` it runs inside, and the `ToolResult` it returns. It
 * is intentionally free of any concrete tool and of any real data source
 * — no network, no API keys, no Supabase, no marketplace specifics. Those
 * live in tools built on top of this framework later.
 *
 * Relationship to `src/ai/types/chat.ts`:
 *  - `ToolDefinition` / `ToolCall` / `JSONSchema` are the *protocol* shapes
 *    a provider exchanges with the model. We reuse them directly.
 *  - The chat module's `ToolResult` is the *wire* shape handed back to the
 *    model (`{ toolCallId, result, isError }`). The `ToolResult<T>` defined
 *    here is the richer *runtime* outcome of executing a tool; the
 *    `ToolExecutor` bridges runtime → wire. They are deliberately distinct.
 *
 * Design goals:
 *  - Every tool is strongly typed on its input and output.
 *  - Tools are pure contracts — data sources are injected via `ToolContext`,
 *    never imported, so tools stay testable and provider-agnostic.
 *  - Results are serializable so they can be persisted or sent to a model.
 */

import type {
  ChatAudience,
  JSONSchema,
  ToolDefinition,
} from "@/ai/types/chat";

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

/**
 * Normalized error categories a tool execution can fail with. Kept
 * provider-neutral so planners and agents can react to failure classes
 * without parsing free-form strings.
 */
export type ToolErrorCode =
  | "invalid_input" // arguments failed validation
  | "not_found" // a requested entity/tool does not exist
  | "unauthorized" // caller/audience is not allowed to run the tool
  | "unavailable" // an injected dependency was missing or offline
  | "timeout" // execution was aborted or timed out
  | "execution_error" // the tool threw while running
  | "unknown"; // anything not otherwise classified

/**
 * A provider-neutral tool error. Tools return this inside a failed
 * `ToolResult`; they should not throw for expected failures.
 */
export interface ToolError {
  /** Stable, machine-readable failure category. */
  code: ToolErrorCode;
  /** Human-readable explanation, safe to surface in logs. */
  message: string;
  /** True when retrying the same call might succeed (timeouts, transient deps). */
  retryable?: boolean;
  /** Original error/detail, retained for debugging. Not sent to the model. */
  cause?: unknown;
}

/* ------------------------------------------------------------------ *
 * Results
 * ------------------------------------------------------------------ */

/**
 * The runtime outcome of executing a tool. A discriminated union so
 * callers narrow on `ok`:
 *
 * ```ts
 * const res = await tool.execute(input, ctx);
 * if (res.ok) use(res.data);
 * else handle(res.error);
 * ```
 *
 * `data` is constrained to be JSON-serializable in spirit so results can
 * be persisted or handed back to a model.
 */
export type ToolResult<T = unknown> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ToolError };

/** Construct a successful `ToolResult`. */
export function ok<T>(data: T): ToolResult<T> {
  return { ok: true, data };
}

/**
 * Construct a failed `ToolResult`. Accepts either a ready-made `ToolError`
 * or the pieces to build one (defaulting the code to `execution_error`).
 */
export function err<T = never>(
  error: ToolError | string,
  code: ToolErrorCode = "execution_error",
): ToolResult<T> {
  if (typeof error === "string") {
    return { ok: false, error: { code, message: error } };
  }
  return { ok: false, error };
}

/** Type guard narrowing a `ToolResult` to its success branch. */
export function isOk<T>(
  result: ToolResult<T>,
): result is { ok: true; data: T } {
  return result.ok === true;
}

/* ------------------------------------------------------------------ *
 * Execution context
 * ------------------------------------------------------------------ */

/**
 * Minimal structured logger a tool may use. Optional everywhere; tools
 * must tolerate its absence. Kept tiny so any sink (console, no-op,
 * buffered test spy) can satisfy it.
 */
export interface ToolLogger {
  debug?(message: string, meta?: Record<string, unknown>): void;
  info?(message: string, meta?: Record<string, unknown>): void;
  warn?(message: string, meta?: Record<string, unknown>): void;
  error?(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Everything a tool needs to run, injected by the caller (a planner, an
 * agent, or the `ToolExecutor`). This is the dependency-injection seam:
 * tools read their data sources from `context.services` rather than
 * importing them, which keeps the framework provider-agnostic and every
 * tool unit-testable.
 *
 * `TServices` lets a caller type the service bag for its own tool set
 * without this framework knowing anything concrete about it.
 */
export interface ToolContext<
  TServices extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Which surface is invoking the tool — used for scoping/authorization. */
  audience: ChatAudience;
  /** Authenticated user id, when the caller is signed in. */
  userId?: string;
  /** Id of the conversation the tool call belongs to, for correlation. */
  conversationId?: string;
  /**
   * Abort signal so long-running tools can cancel promptly when the
   * caller (or the model turn) is cancelled.
   */
  signal?: AbortSignal;
  /**
   * Injected clock. Defaults are the caller's responsibility; tools should
   * prefer this over `Date.now()` so behavior stays testable/deterministic.
   */
  now?: () => number;
  /** Optional structured logger. Tools must handle it being undefined. */
  logger?: ToolLogger;
  /**
   * Injected dependencies (data repositories, gateways, feature flags…).
   * The framework never populates this with anything real — callers wire
   * it up. Typed loosely here; concrete tool sets narrow `TServices`.
   */
  services?: TServices;
  /**
   * Chain of agent audiences in the current delegation path, used to detect
   * and prevent cyclic multi-agent delegations (e.g. customer → vendor →
   * admin → customer). Tools that delegate should check and extend this.
   */
  delegationChain?: readonly string[];
  /** Free-form request-scoped metadata (trace ids, locale, etc.). */
  metadata?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ *
 * Tool contract
 * ------------------------------------------------------------------ */

/**
 * A callable, strongly-typed tool.
 *
 * `TInput` is the validated argument object the tool receives; `TOutput`
 * is the payload it returns on success. Implementations should not throw
 * for expected failures — they return a failed `ToolResult` instead — but
 * the `ToolExecutor` still guards against unexpected throws.
 */
export interface Tool<
  TInput = Record<string, unknown>,
  TOutput = unknown,
  TServices extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Machine name the model/planner uses to call the tool, e.g. `get_order`. */
  readonly name: string;
  /** Short description telling a model when to use the tool. */
  readonly description: string;
  /** JSON-Schema describing the tool's arguments (reused protocol shape). */
  readonly parameters: JSONSchema;
  /**
   * Audiences allowed to call this tool. `undefined` means unrestricted;
   * the executor enforces this before running.
   */
  readonly audiences?: readonly ChatAudience[];

  /**
   * Emit the provider-facing declaration (name/description/parameters) the
   * model needs to know the tool exists. Mirrors `ToolDefinition`.
   */
  toDefinition(): ToolDefinition;

  /**
   * Run the tool. Receives already-parsed arguments and the execution
   * context; returns a runtime `ToolResult`.
   */
  execute(
    input: TInput,
    context: ToolContext<TServices>,
  ): Promise<ToolResult<TOutput>>;
}

/**
 * A `Tool` with its generics erased. Useful for registries and executors
 * that store heterogeneous tools side by side.
 */
export type AnyTool = Tool<Record<string, unknown>, unknown, Record<string, unknown>>;

/* ------------------------------------------------------------------ *
 * Execution options
 * ------------------------------------------------------------------ */

/**
 * Per-call knobs the `ToolExecutor` understands. All optional so callers
 * can execute with just a name + arguments.
 */
export interface ToolExecutionOptions {
  /**
   * Soft timeout in milliseconds. When set, the executor races the tool
   * against a timer and returns a `timeout` error if it elapses. It does
   * not by itself abort the tool — pair with a `signal` for hard cancel.
   */
  timeoutMs?: number;
  /** Abort signal forwarded onto the `ToolContext`. */
  signal?: AbortSignal;
  /**
   * Delegation chain for cycle detection in multi-agent delegation.
   * When set, merged into the `ToolContext` so delegation tools can
   * inspect the chain and reject cycles.
   */
  delegationChain?: readonly string[];
}
