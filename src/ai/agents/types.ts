/**
 * KoshurKart — Agent Framework types
 * =================================================================
 * Provider-agnostic type foundation for the *agent layer* — the top
 * orchestration seam that binds together everything below it:
 *
 *   AIService  (reasoning / provider-agnostic chat)   src/ai/services
 *   Planner    (goal → plan → execute)                src/ai/planner
 *   Tools      (registry + executor)                  src/ai/tools
 *   Memory     (session / conversation / user / …)    src/ai/memory
 *
 * An `Agent` is what a surface (customer, vendor, admin) talks to. Given a
 * user turn it recalls relevant memory, composes a request, delegates
 * generation to the injected `AIService`, runs any tool calls through the
 * injected `ToolExecutor`, persists the exchange, and returns a normalized
 * result. Multi-step objectives are delegated to the injected `Planner`.
 *
 * This file defines the *shape* of that contract only. It is deliberately
 * free of any concrete provider, any real data source, and any marketplace
 * business logic — NO network, NO API keys, NO Supabase, NO UI, NO database.
 * Every integration point is injected via `AgentDependencies` (the DI seam),
 * never imported, so the framework stays provider-agnostic and unit-testable.
 *
 * Design goals:
 *  - Strongly typed end-to-end; `TServices` threads a caller's typed service
 *    bag straight through to the tools and planner its turns invoke.
 *  - Every dependency optional except the reasoning source, so an agent can
 *    run stateless (no memory), tool-less, or plan-less and still work.
 *  - Results are a discriminated union mirroring the tool/planner layers.
 */

import type { AIService } from "@/ai/services/ai.service";
import type {
  Goal,
  Planner,
  PlannerContext,
  PlannerResult,
} from "@/ai/planner";
import type { ToolExecutor, ToolLogger, ToolRegistry } from "@/ai/tools";
import type {
  ConversationMemory,
  RetrievalMemory,
  SessionMemory,
  UserMemory,
} from "@/ai/memory";
import type {
  AIRequestOptions,
  AIStreamEvent,
  ChatAudience,
  ChatMessage,
  FinishReason,
  ToolCall,
  ToolResult as WireToolResult,
  TokenUsage,
} from "@/ai/types/chat";

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

/**
 * Normalized error categories an agent turn can fail with. Kept provider-
 * neutral so callers react to failure classes without parsing free-form
 * strings — mirrors `ToolErrorCode` / `PlannerErrorCode`.
 */
export type AgentErrorCode =
  | "provider_error" // the AIService/provider failed to generate
  | "tool_error" // a tool invocation failed terminally
  | "planning_failed" // the planner could not complete the objective
  | "memory_error" // a recall/persist operation failed
  | "invalid_input" // the turn input was empty or malformed
  | "cancelled" // the turn was aborted via signal
  | "unavailable" // a required injected dependency was missing
  | "unknown"; // anything not otherwise classified

/** A provider-neutral agent error, returned inside a failed `AgentResult`. */
export interface AgentError {
  /** Stable, machine-readable failure category. */
  code: AgentErrorCode;
  /** Human-readable explanation, safe to surface in logs. */
  message: string;
  /** True when retrying the same turn might succeed. */
  retryable?: boolean;
  /** Original error/detail, retained for debugging. Not sent to a model. */
  cause?: unknown;
}

/* ------------------------------------------------------------------ *
 * Turn input & output
 * ------------------------------------------------------------------ */

/**
 * What a caller may hand an agent for a single turn: a bare string (treated
 * as a user message), a ready `ChatMessage`, or an ordered list of messages
 * (e.g. a user turn preceded by injected context).
 */
export type AgentInput = string | ChatMessage | readonly ChatMessage[];

/** A single tool call the model requested paired with the result of running it. */
export interface AgentToolInvocation {
  /** The call the model emitted. */
  readonly call: ToolCall;
  /** The wire-shaped outcome fed back to the model (`cause` stripped). */
  readonly result: WireToolResult;
}

/**
 * Structured metadata produced by the reflection phase, capturing how the
 * model evaluated its own execution.
 */
export interface ReflectionMetadata {
  /** Whether the original objective was achieved and the response is accurate */
  readonly success: boolean;
  /** Self-critique or feedback on what was missed or how to improve */
  readonly feedback: string;
  /** Tools that should have been called but were missed */
  readonly missedActions: readonly string[];
  /** Whether a self-correction pass was triggered during this turn */
  readonly selfCorrected: boolean;
}

/**
 * The successful outcome of an agent turn: the final assistant message plus
 * everything that happened while producing it (tool activity, token usage,
 * how many model round-trips the tool loop took).
 */
export interface AgentResponse {
  /** The final assistant message after any tool round-trips resolved. */
  readonly message: ChatMessage;
  /** Why the final generation stopped. */
  readonly finishReason: FinishReason;
  /** Tool calls run during the turn, in execution order. Empty when none. */
  readonly toolInvocations: readonly AgentToolInvocation[];
  /** How many times the model was called (1 + tool round-trips). */
  readonly roundtrips: number;
  /** Model that produced the final reply (echoed for logging/audit). */
  readonly model: string;
  /** Provider id that served the final reply. */
  readonly provider: string;
  /** Aggregate token usage across round-trips, when the provider reports it. */
  readonly usage?: TokenUsage;
  /** Metadata from the reflection phase, if reflection was enabled. */
  readonly reflection?: ReflectionMetadata;
}

/**
 * The outcome of an agent turn. A discriminated union so callers narrow on
 * `ok`, exactly like `ToolResult` / `StepResult` / `PlannerResult`:
 *
 * ```ts
 * const res = await agent.chat("Where is my order?", inv);
 * if (res.ok) render(res.response.message);
 * else handle(res.error);
 * ```
 */
export type AgentResult =
  | { readonly ok: true; readonly response: AgentResponse }
  | {
      readonly ok: false;
      readonly error: AgentError;
      /** The partial response, when the turn produced one before failing. */
      readonly response?: AgentResponse;
    };

/** Construct a successful `AgentResult`. */
export function agentOk(response: AgentResponse): AgentResult {
  return { ok: true, response };
}

/**
 * Construct a failed `AgentResult`. Accepts either a ready-made `AgentError`
 * or a message (defaulting the code to `unknown`).
 */
export function agentErr(
  error: AgentError | string,
  code: AgentErrorCode = "unknown",
  response?: AgentResponse,
): AgentResult {
  if (typeof error === "string") {
    return { ok: false, error: { code, message: error }, response };
  }
  return { ok: false, error, response };
}

/** Type guard narrowing an `AgentResult` to its success branch. */
export function isAgentOk(
  result: AgentResult,
): result is { ok: true; response: AgentResponse } {
  return result.ok === true;
}

/* ------------------------------------------------------------------ *
 * Memory bundle
 * ------------------------------------------------------------------ */

/**
 * The set of memories an agent may compose. Every slot is optional so an
 * agent can run with any subset (or none) — the base loop degrades to a
 * stateless turn when `conversation` is absent. These reference the concrete
 * memory classes from `src/ai/memory` by type only; instances are injected.
 */
export interface AgentMemory {
  /** Turn-by-turn history + windowing + summarization for a conversation. */
  conversation?: ConversationMemory;
  /** Durable, cross-conversation facts/preferences about the user. */
  user?: UserMemory;
  /** Ephemeral per-session scratch space. */
  session?: SessionMemory;
  /** Embedding-free retrieval over stored items. */
  retrieval?: RetrievalMemory;
}

/* ------------------------------------------------------------------ *
 * Dependencies (the DI seam)
 * ------------------------------------------------------------------ */

/**
 * Everything an agent orchestrates, injected by the caller. This is the
 * single dependency-injection seam: an agent reads its reasoning source,
 * tools, planner, and memory from here rather than importing concrete
 * instances, which keeps the framework provider-agnostic and testable.
 *
 * Only `ai` is required — it is the reasoning source every turn needs. The
 * rest are optional and the agent adapts its capabilities to what is present.
 */
export interface AgentDependencies<
  TServices extends Record<string, unknown> = Record<string, unknown>,
> {
  /** The reasoning source. Required — turns delegate generation to it. */
  ai: AIService;
  /** Catalog of tools to advertise to the model and resolve calls against. */
  tools?: ToolRegistry;
  /** Runner that executes a model's tool calls. Absent → calls are surfaced, not run. */
  executor?: ToolExecutor<TServices>;
  /** Reasoning layer for multi-step objectives. Absent → `plan()` is unavailable. */
  planner?: Planner<TServices>;
  /** Memories the agent recalls from and persists to. Absent → stateless turns. */
  memory?: AgentMemory;
  /** Default typed service bag threaded into tool/planner contexts. */
  services?: TServices;
  /** Optional structured logger forwarded into contexts. */
  logger?: ToolLogger;
  /** Injected clock. Defaults to `Date.now`. Prefer this for testability. */
  now?: () => number;
}

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

/**
 * Construction-time configuration for an agent. All behavioral knobs are
 * optional and have sensible defaults; `dependencies` carries the DI seam.
 */
export interface AgentConfig<
  TServices extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Stable identifier, e.g. "customer". Concrete agents supply a default. */
  id?: string;
  /** Human-readable name for logs/registries. */
  label?: string;
  /**
   * Explicit system-prompt override. When set, it steers the assistant and
   * is what recalled memory (summary/facts) is folded into. When omitted the
   * `AIService` resolves the prompt from its audience map instead.
   */
  systemPrompt?: string;
  /** Baseline generation options merged into every turn. */
  defaultOptions?: AIRequestOptions;
  /**
   * Max model round-trips the tool loop may take before stopping (guards
   * against runaway tool cycles). Defaults to 4.
   */
  maxToolRoundtrips?: number;
  /**
   * Whether to advertise the registry's tools to the model. Defaults to true
   * when a `tools` registry is injected. No effect without one.
   */
  advertiseTools?: boolean;
  /** How many recent turns to recall from conversation memory. Uses the memory's own default when omitted. */
  historyWindow?: number;
  /** Fold durable user facts into the system prompt when available. Default true. */
  includeUserFacts?: boolean;
  /** Compact conversation memory after each turn when it overflows. Default true. */
  compactAfterTurn?: boolean;
  /** Whether a mandatory reflection phase runs after the tool loop to verify the answer. Default true. */
  reflectionEnabled?: boolean;
  /** Optional override for the model used during reflection (e.g., using a stronger model for critique). */
  reflectionModel?: string;
  /** The DI seam — the dependencies this agent orchestrates. */
  dependencies: AgentDependencies<TServices>;
}

/* ------------------------------------------------------------------ *
 * Per-turn invocation
 * ------------------------------------------------------------------ */

/**
 * Per-turn context a caller supplies alongside the input. Carries the
 * identifiers used to scope memory and tool/planner contexts, plus per-turn
 * overrides. All optional so a bare `agent.chat("hi")` works.
 */
export interface AgentInvocation<
  TServices extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Authenticated user id — scope key for `UserMemory`, forwarded to tools. */
  userId?: string;
  /** Conversation id — scope key for `ConversationMemory`, correlation id. */
  conversationId?: string;
  /** Session id — scope key for `SessionMemory`. */
  sessionId?: string;
  /** Abort signal so a caller can cancel an in-flight turn. */
  signal?: AbortSignal;
  /** Injected clock for this turn; falls back to the agent's clock. */
  now?: () => number;
  /** Per-turn logger; falls back to the agent's logger. */
  logger?: ToolLogger;
  /** Per-turn service bag; merged over the agent's default services. */
  services?: TServices;
  /** Per-turn generation option overrides. */
  options?: AIRequestOptions;
  /** Free-form request-scoped metadata (trace ids, locale, etc.). */
  metadata?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ *
 * Capabilities
 * ------------------------------------------------------------------ */

/**
 * A snapshot of what an agent can do, derived from which dependencies were
 * injected. Lets a UI or router adapt without poking at internals.
 */
export interface AgentCapabilities {
  /** The active provider can stream (via the injected `AIService`). */
  readonly streaming: boolean;
  /** A tool registry + executor are present, so the model can call tools. */
  readonly tools: boolean;
  /** A planner is present, so `plan()` can run multi-step objectives. */
  readonly planning: boolean;
  /** Conversation memory is present, so turns are stateful. */
  readonly memory: boolean;
}

/* ------------------------------------------------------------------ *
 * Agent contract
 * ------------------------------------------------------------------ */

/**
 * The contract every agent satisfies. Implementing this (by extending
 * `BaseAgent`) is all it takes to give a surface a reasoning + acting +
 * remembering assistant. Concrete agents (customer/vendor/admin) differ only
 * by their bound `audience` and defaults — never by business logic.
 *
 * `TServices` threads the caller's typed service bag through to the tools and
 * planner a turn invokes, matching the tool, planner, and memory layers.
 */
export interface Agent<
  TServices extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Stable identifier, e.g. "customer". */
  readonly id: string;
  /** Human-readable name for logs/registries. */
  readonly label: string;
  /** The surface this agent serves — scopes prompts, tools, and memory. */
  readonly audience: ChatAudience;
  /** What this agent can do, given its injected dependencies. */
  readonly capabilities: AgentCapabilities;

  /**
   * Run a single conversational turn: recall → compose → generate → run
   * tools → persist. Never rejects for expected failures; those come back as
   * the failed branch of `AgentResult`.
   */
  chat(input: AgentInput, invocation?: AgentInvocation<TServices>): Promise<AgentResult>;

  /**
   * Stream a single turn as an async iterable of provider events. Tool
   * round-trips are not driven here — this is a single-pass stream for UIs
   * that render incremental text. Emits an `error` event on failure.
   */
  stream(
    input: AgentInput,
    invocation?: AgentInvocation<TServices>,
  ): AsyncIterable<AIStreamEvent>;

  /**
   * Delegate a multi-step objective to the injected planner, wiring a full
   * `PlannerContext` from this agent's dependencies. Resolves to a failed
   * `PlannerResult` when no planner is injected.
   */
  plan(goal: Goal, invocation?: AgentInvocation<TServices>): Promise<PlannerResult>;

  /**
   * Clear the conversation (and session) memory scope implied by the
   * invocation. A no-op when no such memory is injected.
   */
  reset(invocation: AgentInvocation<TServices>): Promise<void>;

  /** Build a `PlannerContext` from this agent's deps and an invocation. */
  toPlannerContext(invocation?: AgentInvocation<TServices>): PlannerContext<TServices>;
}
