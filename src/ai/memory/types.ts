/**
 * KoshurKart — AI memory framework types
 * =================================================================
 * Provider-agnostic type foundation for the *memory layer* — the seam that
 * lets AI agents remember things across turns: recent messages, a running
 * summary, durable user facts, and a scratch space for a single session.
 *
 * This file defines the runtime contract for memory: the `MemoryRecord`
 * shape everything is stored as, the `MemoryStore` backend abstraction, the
 * `MemoryContext` a memory operates inside, the `MemoryResult` it returns,
 * and the retrieval/summarization contracts. It is intentionally free of any
 * concrete backend and of any real data source — NO database, NO Supabase,
 * NO network/APIs, NO embeddings, NO marketplace specifics. Those never
 * belong here; a future adapter can implement `MemoryStore` against a real
 * store without any memory class changing.
 *
 * Relationship to the rest of the AI module:
 *  - Reuses `ChatMessage` / `ChatAudience` (src/ai/types/chat.ts) so
 *    conversation memory speaks the same message shape as `AIService`.
 *  - Mirrors the tool layer's `ToolResult` discriminated-union + `ok`/`err`
 *    constructors and the `ToolContext` dependency-injection style.
 *  - `ToolLogger` (src/ai/tools/types.ts) is reused as the logger contract.
 *
 * Design goals:
 *  - Every record is strongly typed on its content and serializable.
 *  - The backing store is injected, never imported — DI-friendly + testable.
 *  - Retrieval and summarization are pluggable strategies, not hard-coded.
 */

import type { ChatAudience, ChatMessage } from "@/ai/types/chat";
import type { ToolLogger } from "@/ai/tools/types";

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

/**
 * Normalized error categories a memory operation can fail with. Kept
 * provider-neutral so agents react to failure classes without parsing
 * free-form strings — mirrors `ToolErrorCode`.
 */
export type MemoryErrorCode =
  | "not_found" // a requested record/scope does not exist
  | "invalid_input" // arguments failed validation (e.g. missing scope key)
  | "capacity_exceeded" // the store's capacity policy rejected a write
  | "unavailable" // an injected dependency (store/summarizer) was missing
  | "unknown"; // anything not otherwise classified

/** A provider-neutral memory error, returned inside a failed `MemoryResult`. */
export interface MemoryError {
  /** Stable, machine-readable failure category. */
  code: MemoryErrorCode;
  /** Human-readable explanation, safe to surface in logs. */
  message: string;
  /** True when retrying the same call might succeed. */
  retryable?: boolean;
  /** Original error/detail, retained for debugging. Not sent to a model. */
  cause?: unknown;
}

/* ------------------------------------------------------------------ *
 * Results
 * ------------------------------------------------------------------ */

/**
 * The runtime outcome of a memory operation. A discriminated union so
 * callers narrow on `ok`, exactly like `ToolResult` / `StepResult`:
 *
 * ```ts
 * const res = await memory.remember(fact, ctx);
 * if (res.ok) use(res.data);
 * else handle(res.error);
 * ```
 */
export type MemoryResult<T = unknown> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: MemoryError };

/** Construct a successful `MemoryResult`. */
export function memOk<T>(data: T): MemoryResult<T> {
  return { ok: true, data };
}

/**
 * Construct a failed `MemoryResult`. Accepts either a ready-made
 * `MemoryError` or a message (defaulting the code to `unknown`).
 */
export function memErr<T = never>(
  error: MemoryError | string,
  code: MemoryErrorCode = "unknown",
): MemoryResult<T> {
  if (typeof error === "string") {
    return { ok: false, error: { code, message: error } };
  }
  return { ok: false, error };
}

/** Type guard narrowing a `MemoryResult` to its success branch. */
export function isMemOk<T>(
  result: MemoryResult<T>,
): result is { ok: true; data: T } {
  return result.ok === true;
}

/**
 * Re-wrap a *failed* result under a different success type so an error can be
 * propagated up a call chain whose return type differs. Uses the same
 * explicit `Extract<...>` assertion the ToolExecutor relies on, because
 * negative narrowing of a boolean discriminant is unreliable under this
 * repo's `strictNullChecks: false`. Only call this on a known-failed result.
 */
export function propagateError<T>(
  result: MemoryResult<unknown>,
): MemoryResult<T> {
  const { error } = result as Extract<MemoryResult<unknown>, { ok: false }>;
  return { ok: false, error };
}

/* ------------------------------------------------------------------ *
 * Scope & records
 * ------------------------------------------------------------------ */

/** Which lifetime/ownership a record belongs to. */
export type MemoryScopeLevel = "session" | "conversation" | "user";

/**
 * Identifies the entity a record belongs to. `key` is the owning id
 * (sessionId / conversationId / userId); memories store many scopes in one
 * backend and filter by this key.
 */
export interface MemoryScope {
  /** The lifetime this record is bound to. */
  level: MemoryScopeLevel;
  /** Owning entity id — the session, conversation, or user. */
  key: string;
  /** Surface the record originated from, when relevant. */
  audience?: ChatAudience;
}

/**
 * The category of a stored item. Drives retrieval filtering and lets a
 * single store hold heterogeneous records side by side.
 * - `message`    — a conversation turn (content is a `ChatMessage`).
 * - `summary`    — a compressed digest of older turns.
 * - `fact`       — a durable statement about the user/world.
 * - `preference` — a durable key/value the user has expressed.
 * - `note`       — a free-form annotation an agent chose to keep.
 * - `state`      — ephemeral session scratch (content is a key/value).
 */
export type MemoryKind =
  | "message"
  | "summary"
  | "fact"
  | "preference"
  | "note"
  | "state";

/**
 * The atomic unit every memory stores. Generic on its `content` so each
 * memory type can be strongly typed while sharing one storage contract.
 * Serializable in spirit so a real backend can persist it unchanged.
 */
export interface MemoryRecord<T = unknown> {
  /** Stable unique id. */
  id: string;
  /** What kind of item this is. */
  kind: MemoryKind;
  /** Which entity/lifetime the record belongs to. */
  scope: MemoryScope;
  /** The strongly-typed payload. */
  content: T;
  /** Epoch millis the record was created / last updated. */
  createdAt: number;
  updatedAt: number;
  /**
   * Relevance weight for retrieval ranking (higher = more important).
   * Defaults to 1 when omitted. Never negative.
   */
  importance?: number;
  /** Free-form tags for filtering and lexical retrieval. */
  tags?: readonly string[];
  /** Free-form metadata (source turn, trace id, etc.). */
  metadata?: Record<string, unknown>;
}

/** A `MemoryRecord` with its content generic erased. */
export type AnyMemoryRecord = MemoryRecord<unknown>;

/* ------------------------------------------------------------------ *
 * Storage backend (the DI seam)
 * ------------------------------------------------------------------ */

/**
 * The pluggable persistence contract every memory reads/writes through.
 * This is the dependency-injection seam that keeps the framework free of
 * any database: the default is an in-memory map (see `base.memory.ts`), and
 * a future adapter could implement this against a real store WITHOUT any
 * memory class changing. Async throughout so such adapters are possible.
 */
export interface MemoryStore<T> {
  /** Insert or replace the value stored under `id`. */
  put(id: string, value: T): Promise<void>;
  /** Fetch a value by id, or `undefined` if absent. */
  get(id: string): Promise<T | undefined>;
  /** All stored values, in insertion order. */
  values(): Promise<T[]>;
  /** Remove a value by id. Returns true if one was actually removed. */
  delete(id: string): Promise<boolean>;
  /** Remove everything. */
  clear(): Promise<void>;
}

/* ------------------------------------------------------------------ *
 * Execution context
 * ------------------------------------------------------------------ */

/**
 * Everything a memory operation needs, injected by the caller (an agent, a
 * planner, or a tool). Mirrors `ToolContext`: dependencies arrive here
 * rather than being imported, so memories stay provider-agnostic and unit
 * testable. The relevant scope id (`sessionId` / `conversationId` /
 * `userId`) is read from here per call.
 *
 * `TServices` lets a caller thread its own typed service bag through,
 * matching the tool and planner layers.
 */
export interface MemoryContext<
  TServices extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Which surface is operating — stored on records for scoping/audit. */
  audience?: ChatAudience;
  /** Authenticated user id — the scope key for `UserMemory`. */
  userId?: string;
  /** Conversation id — the scope key for `ConversationMemory`. */
  conversationId?: string;
  /** Session id — the scope key for `SessionMemory`. */
  sessionId?: string;
  /**
   * Injected clock. Memories prefer this over `Date.now()` so ordering and
   * recency stay deterministic in tests.
   */
  now?: () => number;
  /** Optional structured logger. Memories must tolerate its absence. */
  logger?: ToolLogger;
  /** Injected dependencies for whatever a caller wants to reach. */
  services?: TServices;
  /** Free-form request-scoped metadata (trace ids, locale, etc.). */
  metadata?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ *
 * Retrieval
 * ------------------------------------------------------------------ */

/**
 * A read query over stored records. All fields optional and combined with
 * AND semantics; an empty query matches everything in scope. No embeddings
 * — matching is lexical/structural only.
 */
export interface MemoryQuery {
  /** Free-text terms; scored by lexical overlap against content/tags. */
  text?: string;
  /** Restrict to these kinds. */
  kinds?: readonly MemoryKind[];
  /** Require any of these tags to be present. */
  tags?: readonly string[];
  /** Restrict to a single scope key (session/conversation/user id). */
  scopeKey?: string;
  /** Only records created at or after this epoch-millis. */
  since?: number;
  /** Max results to return, highest score first. */
  limit?: number;
}

/** A record paired with the relevance score a retrieval strategy gave it. */
export interface ScoredMemory<T = unknown> {
  record: MemoryRecord<T>;
  /** Non-negative relevance; higher ranks earlier. */
  score: number;
}

/**
 * Context handed to a `RetrievalStrategy` while scoring, so strategies stay
 * pure functions of their inputs (no clocks/tokenizers of their own).
 */
export interface RetrievalScoringContext {
  /** Current time for recency math. */
  now: number;
  /** The query text pre-tokenized to lowercase terms. */
  queryTokens: readonly string[];
}

/**
 * A pluggable relevance function. Returns a non-negative score for a record
 * against a query; `0` (or negative) excludes it. Must be pure so retrieval
 * stays deterministic — mirrors the planner's `RetryStrategy` shape.
 */
export interface RetrievalStrategy {
  score(
    record: AnyMemoryRecord,
    query: MemoryQuery,
    context: RetrievalScoringContext,
  ): number;
}

/* ------------------------------------------------------------------ *
 * Summarization
 * ------------------------------------------------------------------ */

/** Knobs for a summarization pass. */
export interface SummarizeOptions {
  /** Soft cap on the produced summary length, in characters. */
  maxChars?: number;
  /** Audience the summary is for — lets AI summarizers steer tone. */
  audience?: ChatAudience;
}

/**
 * The output of summarizing a batch of messages. Deliberately small and
 * serializable so it can be stored as a `summary` record.
 */
export interface MemorySummary {
  /** The digest text. */
  text: string;
  /** How many messages it covers. */
  messageCount: number;
  /** Ids of the messages folded into this summary. */
  coveredIds: readonly string[];
}

/**
 * A pluggable summarizer. The default implementation is deterministic and
 * offline (no AI); an optional implementation may delegate to an injected
 * `AIService`. Either way this interface is the seam memory depends on.
 */
export interface Summarizer {
  /** Stable identifier, e.g. "extractive". */
  readonly id: string;
  /** Compress a batch of messages into a `MemorySummary`. */
  summarize(
    messages: readonly ChatMessage[],
    options?: SummarizeOptions,
  ): Promise<MemorySummary>;
}

/* ------------------------------------------------------------------ *
 * Memory contract
 * ------------------------------------------------------------------ */

/**
 * The minimal contract every memory satisfies, tying the family together
 * for barrels and generic callers. Concrete memories add their own strongly
 * typed domain methods (e.g. `ConversationMemory.window`); this base only
 * guarantees identity and a way to wipe a scope.
 */
export interface Memory {
  /** Stable identifier, e.g. "conversation". */
  readonly id: string;
  /**
   * Remove every record for the scope implied by `context` (or all records
   * when the memory is unscoped). Resolves once the store is cleared.
   */
  clearScope(context: MemoryContext): Promise<MemoryResult<number>>;
}
