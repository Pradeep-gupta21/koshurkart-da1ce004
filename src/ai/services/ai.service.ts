/**
 * KoshurKart — AIService
 * =================================================================
 * Provider-agnostic orchestration layer for AI conversations.
 *
 * `AIService` is the single entry point the rest of the app uses to talk
 * to *any* AI provider. It owns conversation assembly (system prompt +
 * history), option merging, and error normalization — but it delegates
 * the actual generation to whatever `AIProvider` adapter it was given.
 *
 * IMPORTANT — this is foundation only:
 *  - It does NOT import or call OpenAI / Claude / Gemini or any API.
 *  - It does NOT hold API keys (those belong server-side, e.g. in a
 *    Supabase edge function that a provider adapter would invoke).
 *  - It renders no UI and depends on no React.
 *
 * A concrete provider is injected via the constructor config, so swapping
 * vendors (or using a mock in tests) never touches call sites.
 */

import type {
  AIChatRequest,
  AIChatResponse,
  AIError,
  AIProvider,
  AIRequestOptions,
  AIServiceConfig,
  AIStreamEvent,
  ChatAudience,
  ChatMessage,
  Conversation,
} from "@/ai/types/chat";

import type { ToolRegistry } from "../tools/registry";
import type { ToolExecutor } from "../tools/executor";
import type { ToolCall } from "../types/chat";

export interface ExtendedAIServiceConfig extends AIServiceConfig {
  registry?: ToolRegistry;
  executor?: ToolExecutor;
  maxToolLoops?: number;
}

/**
 * Thin, reusable service around an injected `AIProvider`.
 *
 * Typical usage (once a real adapter exists):
 * ```ts
 * const ai = new AIService({ provider: someAdapter });
 * const res = await ai.send(conversation, "Where is my order?");
 * ```
 */
export class AIService {
  /** The active provider adapter. Swap by constructing a new service. */
  private readonly provider: AIProvider;

  /** Baseline generation options merged into every request. */
  private readonly defaultOptions: AIRequestOptions;

  /** Audience → system prompt map used to steer the assistant. */
  private readonly systemPrompts: Partial<Record<ChatAudience, string>>;
  
  private readonly registry?: ToolRegistry;
  private readonly executor?: ToolExecutor;
  private readonly maxToolLoops: number;

  constructor(config: ExtendedAIServiceConfig) {
    this.provider = config.provider;
    this.defaultOptions = config.defaultOptions ?? {};
    this.systemPrompts = config.systemPrompts ?? {};
    this.registry = config.registry;
    this.executor = config.executor;
    this.maxToolLoops = config.maxToolLoops ?? 5;
  }

  /* -------------------------------------------------------------- *
   * Introspection
   * -------------------------------------------------------------- */

  /** The id of the provider currently backing this service. */
  get providerId(): string {
    return this.provider.id;
  }

  /** Whether the active provider can stream responses. */
  get supportsStreaming(): boolean {
    return typeof this.provider.stream === "function";
  }

  /* -------------------------------------------------------------- *
   * Public API
   * -------------------------------------------------------------- */

  /**
   * Generate a full (non-streaming) assistant reply for a request.
   * Normalizes any thrown provider error into an `AIError`.
   */
  async chat(request: AIChatRequest): Promise<AIChatResponse> {
    let currentRequest = this.prepareRequest(request);
    let loopCount = 0;
    const maxLoops = this.maxToolLoops;

    while (true) {
      let response: AIChatResponse;
      try {
        response = await this.provider.chat(currentRequest);
      } catch (err) {
        throw this.normalizeError(err);
      }

      const runTools = response.finishReason === "tool_calls" && response.toolCalls && response.toolCalls.length > 0;
      
      if (!runTools || loopCount >= maxLoops || !this.executor) {
        if (runTools && loopCount >= maxLoops) {
          response.finishReason = "length";
        }
        return response;
      }

      loopCount++;
      
      currentRequest.messages = [...currentRequest.messages, response.message];
      
      const toolPromises = response.toolCalls!.map(async (call) => {
        const result = await this.executor!.run(call, { signal: currentRequest.options?.signal });
        const resultContent = typeof result.result === "string" ? result.result : JSON.stringify(result.result);
        return AIService.createMessage("tool", resultContent, { toolCallId: call.id });
      });
      
      const toolMessages = await Promise.all(toolPromises);
      currentRequest.messages = [...currentRequest.messages, ...toolMessages];
    }
  }

  /**
   * Generate a streaming reply as an async iterable of `AIStreamEvent`s.
   * Falls back to a single `delta` + `done` derived from `chat()` when the
   * provider has no native streaming.
   */
  async *stream(request: AIChatRequest): AsyncIterable<AIStreamEvent> {
    let currentRequest = this.prepareRequest({ ...request, options: { ...request.options, stream: true } });
    let loopCount = 0;
    const maxLoops = this.maxToolLoops;

    while (true) {
      let finishReason: FinishReason = "stop";
      let usage: TokenUsage | undefined;
      let toolCalls: ToolCall[] = [];
      let assistantContent = "";
      let hasError = false;

      const iterable = this.provider.stream 
        ? this.provider.stream(currentRequest) 
        : this.emulateStream(currentRequest);

      try {
        for await (const event of iterable) {
          if (event.type === "delta") {
            assistantContent += event.content;
            yield event;
          } else if (event.type === "tool_call") {
            toolCalls.push(event.toolCall);
            yield event;
          } else if (event.type === "error") {
            hasError = true;
            yield event;
            return;
          } else if (event.type === "done") {
            finishReason = event.finishReason;
            usage = event.usage;
          }
        }
      } catch (err) {
        yield { type: "error", error: this.normalizeError(err) };
        return;
      }

      if (hasError) return;

      const runTools = finishReason === "tool_calls" && toolCalls.length > 0;
      
      if (!runTools || loopCount >= maxLoops || !this.executor) {
        yield { type: "done", finishReason: runTools ? "length" : finishReason, usage };
        return;
      }

      loopCount++;

      const assistantMsg = AIService.createMessage("assistant", assistantContent, { toolCalls });
      currentRequest.messages = [...currentRequest.messages, assistantMsg];

      const toolPromises = toolCalls.map(async (call) => {
        const result = await this.executor!.run(call, { signal: currentRequest.options?.signal });
        const resultContent = typeof result.result === "string" ? result.result : JSON.stringify(result.result);
        return AIService.createMessage("tool", resultContent, { toolCallId: call.id });
      });

      const toolMessages = await Promise.all(toolPromises);
      currentRequest.messages = [...currentRequest.messages, ...toolMessages];
    }
  }

  private async *emulateStream(request: AIChatRequest): AsyncIterable<AIStreamEvent> {
    try {
      const res = await this.provider.chat(request);
      if (res.message.content) {
        yield { type: "delta", content: res.message.content };
      }
      for (const call of res.toolCalls ?? []) {
        yield { type: "tool_call", toolCall: call };
      }
      yield { type: "done", finishReason: res.finishReason, usage: res.usage };
    } catch (err) {
      yield { type: "error", error: this.normalizeError(err) };
    }
  }

  /**
   * Convenience wrapper: append a user message to an existing
   * `Conversation` and generate the assistant reply. Returns the reply;
   * the caller decides whether/how to persist it back onto the thread.
   */
  async send(
    conversation: Conversation,
    userText: string,
    options?: AIRequestOptions,
  ): Promise<AIChatResponse> {
    const userMessage = AIService.createMessage("user", userText);
    return this.chat({
      audience: conversation.audience,
      messages: [...conversation.messages, userMessage],
      options: { ...conversation.options, ...options },
    });
  }

  /* -------------------------------------------------------------- *
   * Static helpers (pure, side-effect free)
   * -------------------------------------------------------------- */

  /**
   * Build a well-formed `ChatMessage`. Generates a random id and a
   * timestamp so callers don't have to.
   */
  static createMessage(
    role: ChatMessage["role"],
    content: string,
    extra?: Partial<Omit<ChatMessage, "id" | "role" | "content" | "createdAt">>,
  ): ChatMessage {
    return {
      id: AIService.generateId(),
      role,
      content,
      createdAt: Date.now(),
      ...extra,
    };
  }

  /**
   * Create an empty conversation scoped to an audience. A stable seam for
   * starting new threads before the first user turn.
   */
  static createConversation(audience: ChatAudience, userId?: string): Conversation {
    const now = Date.now();
    return {
      id: AIService.generateId(),
      audience,
      messages: [],
      userId,
      createdAt: now,
      updatedAt: now,
    };
  }

  /* -------------------------------------------------------------- *
   * Internals
   * -------------------------------------------------------------- */

  /**
   * Merge default options, resolve the system prompt for the audience,
   * and ensure a system message is present at the head of the list.
   */
  private prepareRequest(request: AIChatRequest): AIChatRequest {
    const options: AIRequestOptions = { ...this.defaultOptions, ...request.options };
    const systemPrompt = request.systemPrompt ?? this.systemPrompts[request.audience];

    let messages = request.messages;
    const hasSystem = messages.some((m) => m.role === "system");
    if (systemPrompt && !hasSystem) {
      messages = [AIService.createMessage("system", systemPrompt), ...messages];
    }

    return { ...request, messages, systemPrompt, options };
  }

  /**
   * Coerce an unknown thrown value into a normalized `AIError`. Providers
   * are expected to throw richer errors; this guarantees a consistent
   * shape regardless.
   */
  private normalizeError(err: unknown): AIError {
    // Already normalized.
    if (this.isAIError(err)) return err;

    const message = err instanceof Error ? err.message : String(err);
    const isAbort = err instanceof Error && err.name === "AbortError";

    return {
      code: isAbort ? "timeout" : "unknown",
      message,
      retryable: isAbort,
      cause: err,
    };
  }

  /** Type guard for an already-normalized `AIError`. */
  private isAIError(value: unknown): value is AIError {
    return (
      typeof value === "object" &&
      value !== null &&
      "code" in value &&
      "message" in value &&
      "retryable" in value
    );
  }

  /**
   * Generate a unique id. Prefers the platform `crypto.randomUUID` when
   * available; falls back to a timestamped random string otherwise so the
   * service stays dependency-free.
   */
  private static generateId(): string {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
