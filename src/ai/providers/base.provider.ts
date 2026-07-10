/**
 * KoshurKart — Base AI provider
 * =================================================================
 * Abstract base class that implements the shared plumbing every
 * `AIProvider` (see src/ai/types/chat.ts) needs, so concrete adapters
 * only have to implement `chat()`.
 *
 * It is deliberately provider-neutral: NO network calls, NO API keys, NO
 * vendor SDKs. Real adapters (OpenAI / Anthropic / Gemini) would extend
 * this later; for now only the in-repo MockProvider does.
 *
 * The helpers here are pure and deterministic (no Date.now / Math.random)
 * so subclasses like MockProvider can produce reproducible output.
 */

import type {
  AIChatRequest,
  AIChatResponse,
  AIProvider,
  AIStreamEvent,
  ChatMessage,
  ChatRole,
  FinishReason,
  TokenUsage,
} from "@/ai/types/chat";

/**
 * A fixed, deterministic timestamp used for generated messages. Providers
 * must not read the wall clock (that would make output non-reproducible in
 * tests). Callers that need a real timestamp can overwrite `createdAt`.
 */
export const DETERMINISTIC_TIMESTAMP = 0;

export abstract class BaseProvider implements AIProvider {
  /** Stable identifier, e.g. "mock". */
  abstract readonly id: string;
  /** Human-readable provider name. */
  abstract readonly label: string;

  /**
   * Generate a full reply. Concrete providers implement this; the base
   * class derives streaming from it unless the subclass overrides `stream`.
   */
  abstract chat(request: AIChatRequest): Promise<AIChatResponse>;

  /**
   * Default streaming implementation: run `chat()` once and emit the reply
   * as a single `delta` followed by `done`. Subclasses that can produce
   * incremental output (like MockProvider) override this for real chunking.
   */
  async *stream(request: AIChatRequest): AsyncIterable<AIStreamEvent> {
    const res = await this.chat(request);
    if (res.message.content) {
      yield { type: "delta", content: res.message.content };
    }
    for (const call of res.toolCalls ?? []) {
      yield { type: "tool_call", toolCall: call };
    }
    yield { type: "done", finishReason: res.finishReason, usage: res.usage };
  }

  /* -------------------------------------------------------------- *
   * Shared, deterministic helpers
   * -------------------------------------------------------------- */

  /** Build a `ChatMessage` with a deterministic id and timestamp. */
  protected createMessage(
    role: ChatRole,
    content: string,
    seed: string,
    extra?: Partial<Omit<ChatMessage, "id" | "role" | "content" | "createdAt">>,
  ): ChatMessage {
    return {
      id: this.makeId(role, seed),
      role,
      content,
      createdAt: DETERMINISTIC_TIMESTAMP,
      ...extra,
    };
  }

  /** Assemble a well-formed `AIChatResponse` around an assistant message. */
  protected buildResponse(
    message: ChatMessage,
    model: string,
    finishReason: FinishReason = "stop",
    usage?: TokenUsage,
  ): AIChatResponse {
    return {
      message,
      finishReason,
      model,
      provider: this.id,
      usage,
      toolCalls: message.toolCalls,
    };
  }

  /**
   * Rough, deterministic token estimate (whitespace-delimited words). Not a
   * real tokenizer — just enough for provider-neutral usage accounting.
   */
  protected estimateTokens(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
  }

  /** Sum an estimated `TokenUsage` from a prompt and completion string. */
  protected computeUsage(promptText: string, completionText: string): TokenUsage {
    const promptTokens = this.estimateTokens(promptText);
    const completionTokens = this.estimateTokens(completionText);
    return {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
  }

  /**
   * Deterministic id generator. Produces a stable id from a seed via a
   * simple non-cryptographic string hash (FNV-1a-style), so the same input
   * always yields the same id — important for reproducible tests.
   */
  protected makeId(prefix: string, seed: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
      hash ^= seed.charCodeAt(i);
      // multiply by the FNV prime, kept in 32-bit range
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `${this.id}-${prefix}-${hash.toString(16).padStart(8, "0")}`;
  }
}
