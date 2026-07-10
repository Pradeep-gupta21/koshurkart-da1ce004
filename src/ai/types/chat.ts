/**
 * KoshurKart — AI module core types
 * =================================================================
 * Provider-agnostic type foundation for AI conversations.
 *
 * This file defines the *shape* of everything the AI layer passes
 * around — messages, conversations, requests, responses, streaming
 * events, tools, and the contract every provider adapter must
 * implement. It deliberately contains **no** provider-specific code
 * (no OpenAI / Claude / Gemini imports, no network calls). Concrete
 * adapters live behind the `AIProvider` interface so the rest of the
 * app never depends on a particular vendor.
 *
 * Design goals:
 *  - Multiple providers can be swapped without touching call sites.
 *  - Streaming and non-streaming responses share one model.
 *  - Tool/function-calling is expressible but optional.
 *  - Everything is serializable (safe to persist to Supabase / cache).
 */

/* ------------------------------------------------------------------ *
 * Roles & message content
 * ------------------------------------------------------------------ */

/**
 * Who authored a message in a conversation.
 * - `system`    — instructions that steer the assistant (persona, rules).
 * - `user`      — an end user (customer, vendor, or admin).
 * - `assistant` — the AI model's reply.
 * - `tool`      — the result of a tool/function invocation fed back to the model.
 */
export type ChatRole = "system" | "user" | "assistant" | "tool";

/**
 * The surface an AI conversation belongs to. Lets the service pick the
 * right system prompt (see `src/ai/prompts/*.system.ts`) and scope any
 * tools/knowledge the assistant is allowed to use.
 */
export type ChatAudience = "customer" | "vendor" | "admin";

/**
 * A single message in a conversation. Kept intentionally small and
 * serializable so it can be stored, cached, or sent over the wire.
 */
export interface ChatMessage {
  /** Stable unique id (uuid). Useful for React keys, edits, and dedup. */
  id: string;
  /** Author of the message. */
  role: ChatRole;
  /** The natural-language content. Empty string is allowed for tool calls. */
  content: string;
  /** Epoch milliseconds the message was created. */
  createdAt: number;
  /**
   * Only present on `tool` messages: the id of the tool call this message
   * answers (correlates a request with its result).
   */
  toolCallId?: string;
  /**
   * Only present on `assistant` messages that requested tools. The model
   * asked to run these before it can finish its reply.
   */
  toolCalls?: ToolCall[];
  /** Optional free-form metadata (token counts, provider, latency, etc.). */
  metadata?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ *
 * Conversations
 * ------------------------------------------------------------------ */

/**
 * A full conversation thread: an ordered list of messages plus the
 * context needed to continue it (audience, owner, model preferences).
 */
export interface Conversation {
  /** Stable unique id (uuid). */
  id: string;
  /** Which surface this thread belongs to — drives the system prompt. */
  audience: ChatAudience;
  /** Ordered messages, oldest first. */
  messages: ChatMessage[];
  /** Optional human-readable title (e.g. derived from the first message). */
  title?: string;
  /** Supabase auth user id of the owner, when the thread is authenticated. */
  userId?: string;
  /** Epoch millis the conversation was created / last updated. */
  createdAt: number;
  updatedAt: number;
  /** Per-conversation overrides for the default model options. */
  options?: Partial<AIRequestOptions>;
  /** Optional free-form metadata. */
  metadata?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ *
 * Tools / function calling
 * ------------------------------------------------------------------ */

/**
 * Declares a tool the model may call. `parameters` is a JSON-Schema
 * object describing the arguments; keeping it as `unknown`-shaped JSON
 * avoids coupling to any single provider's schema dialect.
 */
export interface ToolDefinition {
  /** Machine name the model uses to call the tool, e.g. `get_order_status`. */
  name: string;
  /** Short description telling the model when to use it. */
  description: string;
  /** JSON-Schema describing the tool's arguments. */
  parameters: JSONSchema;
}

/**
 * A request from the model to invoke a tool with specific arguments.
 * Emitted by the provider; executed by the host application, then the
 * result is returned as a `tool` role message.
 */
export interface ToolCall {
  /** Correlation id linking this call to its eventual result message. */
  id: string;
  /** Name of the tool to run (matches a `ToolDefinition.name`). */
  name: string;
  /** Parsed arguments the model supplied. */
  arguments: Record<string, unknown>;
}

/**
 * The outcome of running a `ToolCall`, handed back to the model so it
 * can continue the conversation.
 */
export interface ToolResult {
  /** Id of the `ToolCall` this result answers. */
  toolCallId: string;
  /** JSON-serializable result payload, or an error description. */
  result: unknown;
  /** True when the tool failed; `result` then holds the error detail. */
  isError?: boolean;
}

/**
 * Minimal JSON-Schema shape used for tool parameter definitions. This is
 * intentionally loose — provider adapters translate it into their own
 * format. Not a full JSON-Schema implementation.
 */
export interface JSONSchema {
  type: "object" | "string" | "number" | "boolean" | "array" | "null";
  description?: string;
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  enum?: Array<string | number>;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ *
 * Requests & options
 * ------------------------------------------------------------------ */

/**
 * Tuning knobs shared across providers. Adapters map these onto their
 * own parameter names and ignore any they don't support.
 */
export interface AIRequestOptions {
  /** Provider model identifier, e.g. `gpt-4o`, `claude-opus-4-8`, `gemini-1.5-pro`. */
  model?: string;
  /** Sampling temperature (0 = deterministic, higher = more creative). */
  temperature?: number;
  /** Hard cap on tokens the model may generate in its reply. */
  maxTokens?: number;
  /** Nucleus-sampling cutoff. */
  topP?: number;
  /** Stop sequences that end generation early. */
  stop?: string[];
  /** When true, the response should be streamed as `AIStreamEvent`s. */
  stream?: boolean;
  /** Tools the model is allowed to call during this request. */
  tools?: ToolDefinition[];
  /** Abort signal so callers can cancel in-flight generations. */
  signal?: AbortSignal;
}

/**
 * A complete request to generate an assistant reply. The service builds
 * this from a `Conversation` (or a bare message list) plus options.
 */
export interface AIChatRequest {
  /** Which surface is asking — used to select the system prompt. */
  audience: ChatAudience;
  /**
   * Messages sent to the model. The system prompt may be prepended by the
   * service, so callers usually pass only user/assistant/tool turns.
   */
  messages: ChatMessage[];
  /** Optional explicit system prompt override. */
  systemPrompt?: string;
  /** Per-request generation options. */
  options?: AIRequestOptions;
}

/* ------------------------------------------------------------------ *
 * Responses
 * ------------------------------------------------------------------ */

/** Why the model stopped generating. */
export type FinishReason =
  | "stop" // natural completion
  | "length" // hit maxTokens
  | "tool_calls" // paused to run tools
  | "content_filter" // blocked by a safety filter
  | "error" // provider/transport failure
  | "cancelled"; // aborted by the caller

/** Token accounting for a single generation, when the provider reports it. */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * A non-streaming assistant reply. For streaming, accumulate
 * `AIStreamEvent`s and assemble an equivalent object at the end.
 */
export interface AIChatResponse {
  /** The assistant message the model produced. */
  message: ChatMessage;
  /** Why generation ended. */
  finishReason: FinishReason;
  /** Model that produced the reply (echoed for logging/audit). */
  model: string;
  /** Provider identifier that served the request. */
  provider: string;
  /** Token usage, if reported. */
  usage?: TokenUsage;
  /** Any tool calls the model requested (also present on the message). */
  toolCalls?: ToolCall[];
}

/* ------------------------------------------------------------------ *
 * Streaming
 * ------------------------------------------------------------------ */

/**
 * Discriminated union of events emitted while streaming a reply.
 * Consumers switch on `type`:
 *  - `delta` — an incremental chunk of assistant text.
 *  - `tool_call` — the model requested a tool mid-stream.
 *  - `done` — generation finished; carries the final metadata.
 *  - `error` — the stream failed.
 */
export type AIStreamEvent =
  | { type: "delta"; content: string }
  | { type: "tool_call"; toolCall: ToolCall }
  | { type: "done"; finishReason: FinishReason; usage?: TokenUsage }
  | { type: "error"; error: AIError };

/* ------------------------------------------------------------------ *
 * Errors
 * ------------------------------------------------------------------ */

/** Normalized error categories so callers don't parse provider strings. */
export type AIErrorCode =
  | "rate_limit"
  | "authentication"
  | "invalid_request"
  | "context_length"
  | "content_filter"
  | "timeout"
  | "network"
  | "provider_unavailable"
  | "unknown";

/**
 * A provider-neutral error. Adapters translate their native errors into
 * this shape so the service and UI can react consistently.
 */
export interface AIError {
  code: AIErrorCode;
  message: string;
  /** True when a retry might succeed (rate limits, timeouts, transient network). */
  retryable: boolean;
  /** Original provider payload, kept for debugging. */
  cause?: unknown;
}

/* ------------------------------------------------------------------ *
 * Provider contract
 * ------------------------------------------------------------------ */

/**
 * The contract every AI provider adapter must satisfy. Implementing this
 * interface (in a future `providers/` folder) is all it takes to plug a
 * new vendor into `AIService` — no call sites change.
 *
 * NOTE: This is a *type only*. No implementation, keys, or network code
 * live here by design.
 */
export interface AIProvider {
  /** Stable identifier, e.g. `"openai"`, `"anthropic"`, `"google"`, `"mock"`. */
  readonly id: string;

  /** Human-readable provider name for logs/settings UIs. */
  readonly label: string;

  /** Generate a full reply in one shot. */
  chat(request: AIChatRequest): Promise<AIChatResponse>;

  /**
   * Generate a reply as an async stream of events. Optional — providers
   * that can't stream may omit it and the service falls back to `chat`.
   */
  stream?(request: AIChatRequest): AsyncIterable<AIStreamEvent>;
}

/**
 * Configuration for wiring up the `AIService`. Purposefully free of
 * secrets — API keys are resolved server-side (e.g. inside a Supabase
 * edge function), never in client code.
 */
export interface AIServiceConfig {
  /** The active provider adapter. */
  provider: AIProvider;
  /** Default generation options applied when a request omits them. */
  defaultOptions?: AIRequestOptions;
  /** Map of audience → default system prompt. */
  systemPrompts?: Partial<Record<ChatAudience, string>>;
}
