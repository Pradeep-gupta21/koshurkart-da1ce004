/**
 * KoshurKart — Groq AI provider (direct fetch)
 * =================================================================
 * Production `AIProvider` adapter for Groq models via Groq's
 * OpenAI-compatible REST API. Uses direct `fetch()` instead of the
 * `openai` npm package to avoid CORS issues in the browser.
 *
 * **Why not the OpenAI SDK?**
 * The `openai` SDK v6 sends custom headers on every request
 * (`User-Agent`, `X-Stainless-Retry-Count`, `X-Stainless-Timeout`,
 * `OpenAI-Organization`, `OpenAI-Project`). These non-standard headers
 * trigger a CORS preflight (`OPTIONS`) request in the browser. Groq's
 * API does not whitelist them in `Access-Control-Allow-Headers`, so
 * the preflight fails and the browser blocks the request — surfacing
 * as `APIConnectionError("Connection error.")` from the SDK.
 *
 * Direct `fetch()` with only `Content-Type` and `Authorization` headers
 * avoids the preflight entirely (simple CORS request) and works from
 * the browser.
 *
 * Supports:
 *  - Non-streaming (`chat`) and native streaming (`stream`).
 *  - Tool / function calling (bidirectional format conversion).
 *  - Fully configurable model — no model name is hardcoded.
 *  - AbortSignal for mid-flight cancellation.
 *  - Provider-neutral error mapping to `AIError`.
 *  - Automatic retry on transient errors (rate limits, 5xx).
 *
 * Security note: This provider makes direct HTTP calls carrying the
 * API key. In production, point requests at a server-side proxy
 * (e.g. a Supabase edge function) that holds the key, so it is never
 * exposed in the browser bundle.
 */

import type {
  AIChatRequest,
  AIChatResponse,
  AIError,
  AIErrorCode,
  AIRequestOptions,
  AIStreamEvent,
  ChatMessage,
  FinishReason,
  TokenUsage,
  ToolCall,
  ToolDefinition,
} from "@/ai/types/chat";
import { BaseProvider } from "./base.provider";

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

/**
 * Default model identifier. Exported so consumers can reference or
 * override it without a second import. This is the single source of
 * truth for the default model; it is always overridable via
 * `GroqProviderConfig.model` or per-request `AIRequestOptions.model`.
 */
export const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

/** Groq's OpenAI-compatible chat completions endpoint. */
const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Maximum number of automatic retries on retryable errors before
 * the provider surfaces an `AIError` to the caller.
 */
const MAX_RETRIES = 2;

/**
 * Configuration for the Groq provider. `apiKey` is the only required
 * field; everything else has sensible, overridable defaults.
 */
export interface GroqProviderConfig {
  /** Groq API key. Injected by the caller — never hardcoded. */
  apiKey: string;

  /**
   * Default model identifier (e.g. `"llama-3.3-70b-versatile"`,
   * `"mixtral-8x7b-32768"`). Can also be overridden per-request via
   * `AIRequestOptions.model`.
   *
   * @default DEFAULT_GROQ_MODEL
   */
  model?: string;
}

/* ------------------------------------------------------------------ *
 * Internal Groq-specific types
 * ------------------------------------------------------------------ */

/**
 * OpenAI SDK finish_reason values returned by Groq. Mapped to our
 * internal `FinishReason` union.
 */
type GroqFinishReason =
  | "stop"
  | "length"
  | "tool_calls"
  | "content_filter"
  | null;

/* ------------------------------------------------------------------ *
 * Wire-format types (Groq OpenAI-compatible API)
 * ------------------------------------------------------------------ */

/** Shape of a single message in the Groq request. */
interface GroqMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: GroqToolCall[];
  tool_call_id?: string;
}

/** Tool call in the Groq wire format. */
interface GroqToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** Groq tool definition. */
interface GroqTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** Shape of Groq's non-streaming response. */
interface GroqChatCompletion {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: GroqToolCall[];
    };
    finish_reason: GroqFinishReason;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** Shape of a single SSE chunk from Groq's streaming response. */
interface GroqStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        index?: number;
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason: GroqFinishReason;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/* ------------------------------------------------------------------ *
 * Provider
 * ------------------------------------------------------------------ */

export class GroqProvider extends BaseProvider {
  readonly id = "groq";
  readonly label = "Groq";

  private readonly apiKey: string;
  private readonly model: string;

  constructor(config: GroqProviderConfig) {
    super();
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_GROQ_MODEL;
  }

  /* -------------------------------------------------------------- *
   * Non-streaming
   * -------------------------------------------------------------- */

  async chat(request: AIChatRequest): Promise<AIChatResponse> {
    // Pre-flight cancellation — surface a graceful response immediately.
    if (request.options?.signal?.aborted) {
      return this.cancelledResponse(request);
    }

    const model = this.resolveModel(request.options);

    const body = this.buildRequestBody(request, model, false);
    const completion = await this.fetchWithRetry<GroqChatCompletion>(
      body,
      request.options?.signal,
    );

    return this.fromGroqCompletion(completion, model);
  }

  /* -------------------------------------------------------------- *
   * Streaming (native SSE)
   * -------------------------------------------------------------- */

  async *stream(request: AIChatRequest): AsyncIterable<AIStreamEvent> {
    if (request.options?.signal?.aborted) {
      yield { type: "done", finishReason: "cancelled" };
      return;
    }

    const model = this.resolveModel(request.options);

    const body = this.buildRequestBody(request, model, true);

    let response: Response;
    try {
      response = await this.doFetch(body, request.options?.signal);
    } catch (err) {
      yield { type: "error", error: this.mapError(err) };
      return;
    }

    if (!response.ok) {
      yield {
        type: "error",
        error: await this.mapHttpError(response),
      };
      return;
    }

    // Parse SSE stream
    const reader = response.body?.getReader();
    if (!reader) {
      yield {
        type: "error",
        error: this.createAIError(
          "network",
          "Response body is not readable.",
          false,
        ),
      };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let lastFinishReason: FinishReason = "stop";
    let lastUsage: TokenUsage | undefined;

    // Buffer for accumulating streamed tool-call arguments across chunks.
    const toolCallBuffers = new Map<
      number,
      { id: string; name: string; argsRaw: string }
    >();

    try {
      while (true) {
        // Cooperatively honour mid-stream cancellation.
        if (request.options?.signal?.aborted) {
          yield { type: "done", finishReason: "cancelled" };
          reader.cancel();
          return;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE lines
        const lines = buffer.split("\n");
        // Keep the last potentially-incomplete line in the buffer.
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":")) continue;
          if (trimmed === "data: [DONE]") continue;
          if (!trimmed.startsWith("data: ")) continue;

          const jsonStr = trimmed.slice(6); // remove "data: "
          let chunk: GroqStreamChunk;
          try {
            chunk = JSON.parse(jsonStr);
          } catch {
            // Malformed chunk — skip silently.
            continue;
          }

          const choice = chunk.choices?.[0];

          if (choice) {
            const delta = choice.delta;

            // --- Text delta ---
            if (delta?.content) {
              yield { type: "delta", content: delta.content };
            }

            // --- Tool-call deltas ---
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCallBuffers.has(idx)) {
                  toolCallBuffers.set(idx, {
                    id: tc.id ?? crypto.randomUUID(),
                    name: tc.function?.name ?? "",
                    argsRaw: "",
                  });
                }
                const buf = toolCallBuffers.get(idx)!;
                if (tc.id) buf.id = tc.id;
                if (tc.function?.name) buf.name = tc.function.name;
                if (tc.function?.arguments)
                  buf.argsRaw += tc.function.arguments;
              }
            }

            // Track finish reason from the final choice chunk.
            if (choice.finish_reason) {
              lastFinishReason = this.fromGroqFinishReason(
                choice.finish_reason,
              );
            }
          }

          // Usage arrives in the last chunk (requires stream_options.include_usage).
          if (chunk.usage) {
            lastUsage = {
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens,
            };
          }
        }
      }
    } catch (err) {
      yield { type: "error", error: this.mapError(err) };
      return;
    }

    // Emit fully-assembled tool_call events after the stream ends.
    let hasToolCalls = false;
    for (const [, buf] of toolCallBuffers) {
      hasToolCalls = true;
      let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(buf.argsRaw || "{}");
        if (typeof parsed === "object" && parsed !== null) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        args = {};
      }
      yield {
        type: "tool_call",
        toolCall: { id: buf.id, name: buf.name, arguments: args },
      };
    }

    if (hasToolCalls && lastFinishReason === "stop") {
      lastFinishReason = "tool_calls";
    }

    yield { type: "done", finishReason: lastFinishReason, usage: lastUsage };
  }

  /* -------------------------------------------------------------- *
   * HTTP layer
   * -------------------------------------------------------------- */

  /**
   * Perform a single fetch to Groq's chat completions endpoint.
   * Uses only CORS-safe headers to avoid preflight failures.
   */
  private async doFetch(
    body: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Response> {
    return fetch(GROQ_CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  }

  /**
   * Fetch with automatic retry on transient errors.
   * Retries on 429 (rate limit) and 5xx (server errors).
   */
  private async fetchWithRetry<T>(
    body: Record<string, unknown>,
    signal?: AbortSignal,
    retriesRemaining: number = MAX_RETRIES,
  ): Promise<T> {
    let lastError: AIError | undefined;

    for (let attempt = 0; attempt <= retriesRemaining; attempt++) {
      let response: Response;

      try {
        response = await this.doFetch(body, signal);
      } catch (err) {
        // Network error — retry if attempts remain.
        lastError = this.mapError(err);
        if (attempt < retriesRemaining) {
          await this.retryDelay(attempt);
          continue;
        }
        throw lastError;
      }

      if (response.ok) {
        return (await response.json()) as T;
      }

      // Build structured error from HTTP response.
      const aiError = await this.mapHttpError(response);

      // Only retry on retryable status codes.
      if (aiError.retryable && attempt < retriesRemaining) {
        lastError = aiError;
        // Respect Retry-After header if present.
        const retryAfter = response.headers.get("retry-after");
        if (retryAfter) {
          const secs = parseInt(retryAfter, 10);
          if (!isNaN(secs) && secs > 0 && secs <= 60) {
            await new Promise((r) => setTimeout(r, secs * 1000));
            continue;
          }
        }
        await this.retryDelay(attempt);
        continue;
      }

      throw aiError;
    }

    // Should never reach here, but just in case.
    throw lastError ?? this.createAIError("unknown", "Unexpected retry exhaustion.", false);
  }

  /** Simple exponential back-off with jitter. */
  private retryDelay(attempt: number): Promise<void> {
    const base = Math.min(1000 * 2 ** attempt, 8000);
    const jitter = Math.random() * base * 0.5;
    return new Promise((r) => setTimeout(r, base + jitter));
  }

  /* -------------------------------------------------------------- *
   * Request conversion: our types → Groq wire format
   * -------------------------------------------------------------- */

  /**
   * Build the JSON request body for the Groq API.
   */
  private buildRequestBody(
    request: AIChatRequest,
    model: string,
    stream: boolean,
  ): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model,
      messages: this.toGroqMessages(request),
      stream,
    };

    if (stream) {
      body.stream_options = { include_usage: true };
    }

    const opts = request.options;
    if (opts?.temperature !== undefined) body.temperature = opts.temperature;
    if (opts?.maxTokens !== undefined) body.max_tokens = opts.maxTokens;
    if (opts?.topP !== undefined) body.top_p = opts.topP;
    if (opts?.stop?.length) body.stop = opts.stop;
    if (opts?.tools?.length) body.tools = this.toGroqTools(opts.tools);

    return body;
  }

  /**
   * Convert our `AIChatRequest` messages into the Groq/OpenAI
   * message format.
   */
  private toGroqMessages(request: AIChatRequest): GroqMessage[] {
    const out: GroqMessage[] = [];

    // Prepend an explicit system prompt when provided.
    const explicitSystem = request.systemPrompt?.trim();
    if (explicitSystem) {
      out.push({ role: "system", content: explicitSystem });
    }

    for (const msg of request.messages) {
      switch (msg.role) {
        case "system":
          if (!explicitSystem) {
            out.push({ role: "system", content: msg.content });
          }
          break;

        case "user":
          out.push({ role: "user", content: msg.content });
          break;

        case "assistant": {
          const assistantMsg: GroqMessage = {
            role: "assistant",
            content: msg.content || null,
          };
          if (msg.toolCalls?.length) {
            assistantMsg.tool_calls = msg.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.arguments),
              },
            }));
          }
          out.push(assistantMsg);
          break;
        }

        case "tool":
          out.push({
            role: "tool",
            tool_call_id: msg.toolCallId ?? "",
            content: msg.content,
          });
          break;
      }
    }

    return out;
  }

  /** Map our `ToolDefinition[]` → Groq tool format. */
  private toGroqTools(tools: ToolDefinition[]): GroqTool[] {
    return tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters as Record<string, unknown>,
      },
    }));
  }

  /* -------------------------------------------------------------- *
   * Response conversion: Groq wire format → our types
   * -------------------------------------------------------------- */

  /** Convert a non-streaming `GroqChatCompletion` into our `AIChatResponse`. */
  private fromGroqCompletion(
    completion: GroqChatCompletion,
    model: string,
  ): AIChatResponse {
    const choice = completion.choices[0];
    if (!choice) {
      throw this.createAIError(
        "provider_unavailable",
        "Groq returned an empty response with no choices.",
        true,
      );
    }

    const msgContent = choice.message.content ?? "";
    const toolCalls = this.fromGroqToolCalls(choice.message.tool_calls);
    let finishReason = this.fromGroqFinishReason(choice.finish_reason);
    if (toolCalls.length > 0 && finishReason === "stop") {
      finishReason = "tool_calls";
    }

    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: msgContent,
      createdAt: Date.now(),
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      metadata: { provider: this.id, model },
    };

    const usage: TokenUsage | undefined = completion.usage
      ? {
          promptTokens: completion.usage.prompt_tokens,
          completionTokens: completion.usage.completion_tokens,
          totalTokens: completion.usage.total_tokens,
        }
      : undefined;

    return this.buildResponse(message, model, finishReason, usage);
  }

  /**
   * Convert Groq wire-format `tool_calls` → our `ToolCall[]`.
   * Returns an empty array when `tool_calls` is absent/null.
   */
  private fromGroqToolCalls(raw?: GroqToolCall[] | null): ToolCall[] {
    if (!raw?.length) return [];
    const result: ToolCall[] = [];
    for (const tc of raw) {
      if (tc.type !== "function") continue;
      let args: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(tc.function.arguments || "{}");
        if (typeof parsed === "object" && parsed !== null) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        args = {};
      }
      result.push({ id: tc.id, name: tc.function.name, arguments: args });
    }
    return result;
  }

  /** Map Groq finish reasons → our internal `FinishReason`. */
  private fromGroqFinishReason(reason: GroqFinishReason): FinishReason {
    switch (reason) {
      case "stop":
        return "stop";
      case "length":
        return "length";
      case "tool_calls":
        return "tool_calls";
      case "content_filter":
        return "content_filter";
      default:
        return "stop";
    }
  }

  /* -------------------------------------------------------------- *
   * Helpers
   * -------------------------------------------------------------- */

  /**
   * Resolve the effective model: per-request override via
   * `AIRequestOptions.model` takes priority, then the instance-level
   * config default.
   */
  private resolveModel(options?: AIRequestOptions): string {
    return options?.model ?? this.model;
  }

  /**
   * Build a graceful "cancelled" response for pre-flight abort checks.
   */
  private cancelledResponse(request: AIChatRequest): AIChatResponse {
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      metadata: { provider: this.id, cancelled: true },
    };
    return this.buildResponse(
      message,
      this.resolveModel(request.options),
      "cancelled",
    );
  }

  /* -------------------------------------------------------------- *
   * Error handling
   * -------------------------------------------------------------- */

  /**
   * Map a non-OK HTTP response into a structured `AIError`.
   */
  private async mapHttpError(response: Response): Promise<AIError> {
    let bodyText = "";
    try {
      bodyText = await response.text();
    } catch {
      // If reading the body fails, proceed with empty text.
    }

    let detail = bodyText;
    try {
      const json = JSON.parse(bodyText);
      if (json?.error?.message) {
        detail = json.error.message;
      }
    } catch {
      // Not JSON — use raw body text.
    }

    const status = response.status;
    return this.createAIError(
      this.httpStatusToErrorCode(status),
      `Groq API error (${status}): ${detail}`,
      status === 429 || status >= 500,
    );
  }

  /**
   * Map any thrown value into a provider-neutral `AIError`. Handles
   * network failures, AbortError, and plain `Error` objects.
   */
  private mapError(err: unknown): AIError {
    // AbortError — raised when the caller cancels the request.
    if (err instanceof Error && err.name === "AbortError") {
      return this.createAIError(
        "timeout",
        "Request was aborted by the caller.",
        false,
        err,
      );
    }

    // Generic network or unknown error.
    const message = err instanceof Error ? err.message : String(err);
    return this.createAIError(
      "network",
      `Network error: ${message}`,
      true,
      err,
    );
  }

  /** Map HTTP status codes → normalised `AIErrorCode`. */
  private httpStatusToErrorCode(status: number): AIErrorCode {
    switch (status) {
      case 400:
        return "invalid_request";
      case 401:
      case 403:
        return "authentication";
      case 404:
        return "invalid_request";
      case 413:
        return "context_length";
      case 429:
        return "rate_limit";
      default:
        return status >= 500 ? "provider_unavailable" : "unknown";
    }
  }

  /** Construct a structured `AIError` object. */
  private createAIError(
    code: AIErrorCode,
    message: string,
    retryable: boolean,
    cause?: unknown,
  ): AIError {
    return { code, message, retryable, cause };
  }
}

/* ------------------------------------------------------------------ *
 * Factory
 * ------------------------------------------------------------------ */

/** Convenience factory — returns a ready-to-use `GroqProvider`. */
export function createGroqProvider(config: GroqProviderConfig): GroqProvider {
  return new GroqProvider(config);
}
