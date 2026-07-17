/**
 * KoshurKart — Gemini AI provider
 * =================================================================
 * Production `AIProvider` adapter for Google's Gemini models. Calls
 * the Gemini REST API directly via browser-native `fetch` — zero SDK
 * dependencies. Supports:
 *
 *  - Non-streaming (`chat`) and streaming (`stream`) generation.
 *  - Tool / function calling (bidirectional format conversion).
 *  - Fully configurable model — no model name is hardcoded. Change
 *    models via config or per-request `AIRequestOptions.model`.
 *  - AbortSignal for mid-flight cancellation.
 *  - Provider-neutral error mapping to `AIError`.
 *
 * The API key is injected via `GeminiProviderConfig` — the provider
 * never reads environment variables or hardcodes secrets.
 *
 * Security note: This provider makes direct HTTP calls carrying the
 * API key. In production, point `baseUrl` at a server-side proxy
 * (e.g. a Supabase edge function) that holds the key, so it is never
 * exposed to the browser.
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
import type {
  GeminiContent,
  GeminiErrorResponse,
  GeminiFinishReason,
  GeminiGenerationConfig,
  GeminiPart,
  GeminiRequest,
  GeminiResponse,
  GeminiTool,
  GeminiUsageMetadata,
} from "./gemini.types";

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

/**
 * Default model identifier. Exported so consumers can reference or
 * override it. No model name is ever hardcoded inside the provider —
 * this constant is the single source of truth for the default, and it
 * is always overridable via `GeminiProviderConfig.model` or the
 * per-request `AIRequestOptions.model`.
 */
export const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";

/** Default API base URL for the Gemini REST API. */
const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com";

/** Default API version path segment. */
const DEFAULT_API_VERSION = "v1beta";

/**
 * Configuration for the Gemini provider. The API key is the only
 * required field; everything else has sensible, overridable defaults.
 */
export interface GeminiProviderConfig {
  /** Gemini API key. Injected by the caller — never hardcoded. */
  apiKey: string;

  /**
   * Default model identifier (e.g. `"gemini-2.5-flash"`,
   * `"gemini-2.5-pro"`, `"gemini-2.0-flash"`). This can also be
   * overridden per-request via `AIRequestOptions.model`.
   *
   * @default DEFAULT_GEMINI_MODEL
   */
  model?: string;

  /**
   * Base URL for the Gemini API. Override to route requests through
   * a server-side proxy that holds the API key.
   *
   * @default "https://generativelanguage.googleapis.com"
   */
  baseUrl?: string;

  /**
   * API version path segment.
   * @default "v1beta"
   */
  apiVersion?: string;
}

/* ------------------------------------------------------------------ *
 * Provider
 * ------------------------------------------------------------------ */

export class GeminiProvider extends BaseProvider {
  readonly id = "gemini";
  readonly label = "Google Gemini";

  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly apiVersion: string;

  constructor(config: GeminiProviderConfig) {
    super();
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_GEMINI_MODEL;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.apiVersion = config.apiVersion ?? DEFAULT_API_VERSION;
  }

  /* -------------------------------------------------------------- *
   * Non-streaming
   * -------------------------------------------------------------- */

  async chat(request: AIChatRequest): Promise<AIChatResponse> {
    // Pre-flight cancellation — match MockProvider's graceful pattern.
    if (request.options?.signal?.aborted) {
      return this.cancelledResponse(request);
    }

    const model = this.resolveModel(request.options);
    const body = this.toGeminiRequest(request);
    const url = this.endpointUrl(model, "generateContent");

    const httpResponse = await fetch(url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: request.options?.signal,
    }).catch((cause) => {
      throw this.mapFetchError(cause);
    });

    if (!httpResponse.ok) {
      throw await this.mapHttpError(httpResponse);
    }

    const raw: GeminiResponse = await httpResponse.json();
    return this.fromGeminiResponse(raw, model);
  }

  /* -------------------------------------------------------------- *
   * Streaming (SSE override)
   * -------------------------------------------------------------- */

  async *stream(request: AIChatRequest): AsyncIterable<AIStreamEvent> {
    if (request.options?.signal?.aborted) {
      yield { type: "done", finishReason: "cancelled" };
      return;
    }

    const model = this.resolveModel(request.options);
    const body = this.toGeminiRequest(request);
    const url = this.endpointUrl(model, "streamGenerateContent") + "?alt=sse";

    let httpResponse: Response;
    try {
      httpResponse = await fetch(url, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: request.options?.signal,
      });
    } catch (cause) {
      yield { type: "error", error: this.mapFetchError(cause) };
      return;
    }

    if (!httpResponse.ok) {
      yield { type: "error", error: await this.mapHttpError(httpResponse) };
      return;
    }

    yield* this.parseSSEStream(httpResponse, request.options?.signal);
  }

  /* -------------------------------------------------------------- *
   * Request conversion: our types → Gemini wire format
   * -------------------------------------------------------------- */

  /**
   * Build the full Gemini request body from our provider-neutral
   * `AIChatRequest`.
   */
  private toGeminiRequest(request: AIChatRequest): GeminiRequest {
    const gemini: GeminiRequest = {
      contents: this.toGeminiContents(request.messages),
    };

    // System instruction — explicit systemPrompt takes priority,
    // then any system-role messages in the conversation.
    const systemText = this.resolveSystemText(request);
    if (systemText) {
      gemini.systemInstruction = { parts: [{ text: systemText }] };
    }

    // Tools → Gemini functionDeclarations.
    if (request.options?.tools?.length) {
      gemini.tools = this.toGeminiTools(request.options.tools);
    }

    // Generation config (temperature, maxOutputTokens, …).
    const config = this.toGeminiConfig(request.options);
    if (config) {
      gemini.generationConfig = config;
    }

    return gemini;
  }

  /**
   * Convert our `ChatMessage[]` → Gemini `Content[]`.
   *
   * - `system` messages are excluded (handled via `systemInstruction`).
   * - `user` → `role: "user"` with text part.
   * - `assistant` → `role: "model"` with text and/or `functionCall` parts.
   * - `tool` → `role: "user"` with `functionResponse` parts (the function
   *   name is resolved from the preceding assistant message's `toolCalls`).
   */
  private toGeminiContents(messages: ChatMessage[]): GeminiContent[] {
    const contents: GeminiContent[] = [];

    for (const msg of messages) {
      switch (msg.role) {
        case "user":
          contents.push({ role: "user", parts: [{ text: msg.content }] });
          break;

        case "assistant": {
          const parts: GeminiPart[] = [];
          if (msg.content) {
            parts.push({ text: msg.content });
          }
          if (msg.toolCalls) {
            for (const call of msg.toolCalls) {
              parts.push({
                functionCall: { name: call.name, args: call.arguments },
              });
            }
          }
          if (parts.length > 0) {
            contents.push({ role: "model", parts });
          }
          break;
        }

        case "tool": {
          const name = this.resolveToolName(msg.toolCallId, messages);
          let response: Record<string, unknown>;
          try {
            const parsed = JSON.parse(msg.content);
            response =
              typeof parsed === "object" && parsed !== null
                ? (parsed as Record<string, unknown>)
                : { result: parsed };
          } catch {
            response = { result: msg.content };
          }
          contents.push({
            role: "user",
            parts: [{ functionResponse: { name, response } }],
          });
          break;
        }

        // System messages handled by resolveSystemText().
        case "system":
          break;
      }
    }

    return contents;
  }

  /** Map our `ToolDefinition[]` → Gemini tool array. */
  private toGeminiTools(tools: ToolDefinition[]): GeminiTool[] {
    return [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters as Record<string, unknown>,
        })),
      },
    ];
  }

  /** Map `AIRequestOptions` → Gemini `generationConfig`. */
  private toGeminiConfig(
    options?: AIRequestOptions,
  ): GeminiGenerationConfig | null {
    if (!options) return null;
    const config: GeminiGenerationConfig = {};
    let hasValue = false;

    if (options.temperature !== undefined) {
      config.temperature = options.temperature;
      hasValue = true;
    }
    if (options.maxTokens !== undefined) {
      config.maxOutputTokens = options.maxTokens;
      hasValue = true;
    }
    if (options.topP !== undefined) {
      config.topP = options.topP;
      hasValue = true;
    }
    if (options.stop?.length) {
      config.stopSequences = options.stop;
      hasValue = true;
    }

    return hasValue ? config : null;
  }

  /* -------------------------------------------------------------- *
   * Response conversion: Gemini wire format → our types
   * -------------------------------------------------------------- */

  /** Convert a Gemini response into our `AIChatResponse`. */
  private fromGeminiResponse(
    raw: GeminiResponse,
    model: string,
  ): AIChatResponse {
    const candidate = raw.candidates?.[0];
    if (!candidate?.content) {
      throw this.createAIError(
        "provider_unavailable",
        "Gemini returned an empty response with no candidates.",
        true,
      );
    }

    // Extract text and tool calls from the candidate's parts.
    let text = "";
    const toolCalls: ToolCall[] = [];

    for (const part of candidate.content.parts ?? []) {
      if (part.text) {
        text += part.text;
      }
      if (part.functionCall) {
        toolCalls.push({
          id: crypto.randomUUID(),
          name: part.functionCall.name,
          arguments: part.functionCall.args ?? {},
        });
      }
    }

    // Map finish reason — override to "tool_calls" when calls are present.
    let finishReason = this.fromGeminiFinishReason(candidate.finishReason);
    if (toolCalls.length > 0 && finishReason === "stop") {
      finishReason = "tool_calls";
    }

    // Build the ChatMessage with real id and timestamp.
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: text,
      createdAt: Date.now(),
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
      metadata: { provider: this.id, model },
    };

    const usage = raw.usageMetadata
      ? this.fromGeminiUsage(raw.usageMetadata)
      : undefined;

    return this.buildResponse(message, model, finishReason, usage);
  }

  /** Map Gemini's uppercase finish reasons → our lowercase `FinishReason`. */
  private fromGeminiFinishReason(
    reason?: GeminiFinishReason,
  ): FinishReason {
    switch (reason) {
      case "STOP":
        return "stop";
      case "MAX_TOKENS":
        return "length";
      case "SAFETY":
      case "RECITATION":
        return "content_filter";
      case "OTHER":
        return "error";
      case "FINISH_REASON_UNSPECIFIED":
      default:
        return "stop";
    }
  }

  /** Map Gemini's usage metadata → our `TokenUsage`. */
  private fromGeminiUsage(meta: GeminiUsageMetadata): TokenUsage {
    return {
      promptTokens: meta.promptTokenCount,
      completionTokens: meta.candidatesTokenCount,
      totalTokens: meta.totalTokenCount,
    };
  }

  /* -------------------------------------------------------------- *
   * SSE stream parser
   * -------------------------------------------------------------- */

  /**
   * Parse the SSE stream from `streamGenerateContent?alt=sse` and
   * yield `AIStreamEvent`s. Each `data:` line is a complete JSON
   * `GeminiResponse` chunk.
   */
  private async *parseSSEStream(
    httpResponse: Response,
    signal?: AbortSignal,
  ): AsyncIterable<AIStreamEvent> {
    const reader = httpResponse.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let lastUsage: TokenUsage | undefined;
    let lastFinishReason: FinishReason = "stop";
    let hasToolCalls = false;

    try {
      while (true) {
        // Cooperatively honour mid-stream cancellation.
        if (signal?.aborted) {
          yield { type: "done", finishReason: "cancelled" };
          return;
        }

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop()!; // Keep the last (possibly incomplete) line.

        for (const line of lines) {
          const trimmed = line.trim();
          // Skip empty lines and SSE comments.
          if (!trimmed || trimmed.startsWith(":")) continue;

          if (trimmed.startsWith("data: ")) {
            const jsonStr = trimmed.slice(6).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;

            try {
              const chunk: GeminiResponse = JSON.parse(jsonStr);
              const candidate = chunk.candidates?.[0];
              if (!candidate?.content) continue;

              for (const part of candidate.content.parts ?? []) {
                if (part.text) {
                  yield { type: "delta", content: part.text };
                }
                if (part.functionCall) {
                  hasToolCalls = true;
                  yield {
                    type: "tool_call",
                    toolCall: {
                      id: crypto.randomUUID(),
                      name: part.functionCall.name,
                      arguments: part.functionCall.args ?? {},
                    },
                  };
                }
              }

              // Track the latest finish reason and usage for the final event.
              if (candidate.finishReason) {
                lastFinishReason = this.fromGeminiFinishReason(
                  candidate.finishReason,
                );
              }
              if (chunk.usageMetadata) {
                lastUsage = this.fromGeminiUsage(chunk.usageMetadata);
              }
            } catch {
              // Skip malformed JSON chunks — SSE streams can contain
              // incomplete data across read boundaries.
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Override finish reason when the stream contained tool calls.
    if (hasToolCalls && lastFinishReason === "stop") {
      lastFinishReason = "tool_calls";
    }

    yield { type: "done", finishReason: lastFinishReason, usage: lastUsage };
  }

  /* -------------------------------------------------------------- *
   * Helpers
   * -------------------------------------------------------------- */

  /**
   * Resolve the effective model: per-request override from
   * `AIRequestOptions.model` takes priority, then the instance-level
   * config, then the exported `DEFAULT_GEMINI_MODEL`. No model name
   * is ever hardcoded inside the provider's logic.
   */
  private resolveModel(options?: AIRequestOptions): string {
    return options?.model ?? this.model;
  }

  /** Build the endpoint URL for a given model and RPC method. */
  private endpointUrl(model: string, method: string): string {
    return `${this.baseUrl}/${this.apiVersion}/models/${model}:${method}`;
  }

  /** Build standard headers for Gemini API requests. */
  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "x-goog-api-key": this.apiKey,
    };
  }

  /**
   * Resolve the system text from either the explicit `systemPrompt`
   * field or any `system`-role messages in the conversation.
   */
  private resolveSystemText(request: AIChatRequest): string {
    if (request.systemPrompt) return request.systemPrompt;
    const systemMsgs = request.messages.filter((m) => m.role === "system");
    if (systemMsgs.length === 0) return "";
    return systemMsgs.map((m) => m.content).join("\n");
  }

  /**
   * Look up the function name for a `tool` message by scanning the
   * conversation for the assistant message whose `toolCalls` contain
   * the matching `toolCallId`.
   */
  private resolveToolName(
    toolCallId: string | undefined,
    messages: ChatMessage[],
  ): string {
    if (!toolCallId) return "unknown";
    for (const msg of messages) {
      if (msg.role === "assistant" && msg.toolCalls) {
        const match = msg.toolCalls.find((c) => c.id === toolCallId);
        if (match) return match.name;
      }
    }
    return "unknown";
  }

  /**
   * Build a graceful "cancelled" response for pre-flight abort,
   * matching MockProvider's pattern of returning a response rather
   * than throwing.
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

  /** Map an HTTP error response → provider-neutral `AIError`. */
  private async mapHttpError(response: Response): Promise<AIError> {
    let detail = "";
    try {
      const body: GeminiErrorResponse = await response.json();
      detail = body.error?.message ?? "";
    } catch {
      detail = response.statusText;
    }

    return this.createAIError(
      this.httpStatusToErrorCode(response.status),
      `Gemini API error (${response.status}): ${detail}`,
      response.status === 429 || response.status >= 500,
      { status: response.status },
    );
  }

  /** Map a `fetch`-level error (network, abort) → `AIError`. */
  private mapFetchError(cause: unknown): AIError {
    if (cause instanceof Error && cause.name === "AbortError") {
      return this.createAIError("timeout", "Request was aborted.", false, cause);
    }
    const message =
      cause instanceof Error ? cause.message : String(cause);
    return this.createAIError(
      "network",
      `Network error: ${message}`,
      true,
      cause,
    );
  }

  /** Map HTTP status codes → normalized `AIErrorCode`. */
  private httpStatusToErrorCode(status: number): AIErrorCode {
    switch (status) {
      case 400:
        return "invalid_request";
      case 401:
      case 403:
        return "authentication";
      case 404:
        return "invalid_request";
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

/** Convenience factory for a ready-to-use Gemini provider. */
export function createGeminiProvider(
  config: GeminiProviderConfig,
): GeminiProvider {
  return new GeminiProvider(config);
}
