/**
 * KoshurKart — Mock AI provider
 * =================================================================
 * A fully offline, deterministic `AIProvider` implementation for tests,
 * local development, and wiring up the AI layer before any real vendor is
 * connected.
 *
 * Guarantees:
 *  - NEVER makes a network request and needs no API key.
 *  - Deterministic: the same request always yields the same response
 *    (no Date.now / Math.random anywhere in the path).
 *  - Supports both non-streaming (`chat`) and streaming (`stream`) modes.
 *  - Echoes conversation context *safely* — it summarizes the turns and
 *    reflects the last user message, but never leaks the raw system prompt.
 *
 * It plugs into `AIService` via dependency injection exactly like a real
 * provider would: `new AIService({ provider: new MockProvider() })`.
 */

import type {
  AIChatRequest,
  AIChatResponse,
  AIStreamEvent,
  ChatMessage,
} from "@/ai/types/chat";
import { BaseProvider } from "./base.provider";

/** Options to tune the mock's deterministic behavior. */
export interface MockProviderOptions {
  /** Model name echoed back on responses. Default: "mock-model". */
  model?: string;
  /**
   * Optional deterministic responder. Given the request it must return the
   * assistant reply text. If omitted, a built-in safe echo/summary is used.
   * MUST be pure (no side effects, no clock/randomness) to stay deterministic.
   */
  responder?: (request: AIChatRequest) => string;
  /**
   * How to split the reply when streaming: "word" (default) or "char".
   */
  streamChunkBy?: "word" | "char";
}

export class MockProvider extends BaseProvider {
  readonly id = "mock";
  readonly label = "Mock Provider (offline, deterministic)";

  private readonly model: string;
  private readonly responder?: (request: AIChatRequest) => string;
  private readonly streamChunkBy: "word" | "char";

  constructor(options: MockProviderOptions = {}) {
    super();
    this.model = options.model ?? "mock-model";
    this.responder = options.responder;
    this.streamChunkBy = options.streamChunkBy ?? "word";
  }

  /* -------------------------------------------------------------- *
   * Non-streaming
   * -------------------------------------------------------------- */

  async chat(request: AIChatRequest): Promise<AIChatResponse> {
    // Honour cancellation deterministically if an already-aborted signal is passed.
    if (request.options?.signal?.aborted) {
      const cancelled = this.createMessage("assistant", "", this.seedFor(request), {
        metadata: { cancelled: true },
      });
      return this.buildResponse(cancelled, this.model, "cancelled");
    }

    const replyText = this.buildReplyText(request);
    const message = this.createMessage("assistant", replyText, this.seedFor(request), {
      metadata: { provider: this.id, model: this.model, mock: true },
    });
    const usage = this.computeUsage(this.promptText(request), replyText);
    return this.buildResponse(message, this.model, "stop", usage);
  }

  /* -------------------------------------------------------------- *
   * Streaming
   * -------------------------------------------------------------- */

  async *stream(request: AIChatRequest): AsyncIterable<AIStreamEvent> {
    if (request.options?.signal?.aborted) {
      yield { type: "done", finishReason: "cancelled" };
      return;
    }

    const replyText = this.buildReplyText(request);
    const chunks = this.chunk(replyText);

    for (const piece of chunks) {
      // Cooperatively honour mid-stream cancellation.
      if (request.options?.signal?.aborted) {
        yield { type: "done", finishReason: "cancelled" };
        return;
      }
      yield { type: "delta", content: piece };
    }

    const usage = this.computeUsage(this.promptText(request), replyText);
    yield { type: "done", finishReason: "stop", usage };
  }

  /* -------------------------------------------------------------- *
   * Deterministic reply construction
   * -------------------------------------------------------------- */

  /** Produce the reply text — custom responder if provided, else safe echo. */
  private buildReplyText(request: AIChatRequest): string {
    if (this.responder) return this.responder(request);
    return this.safeEcho(request);
  }

  /**
   * Build a safe, deterministic summary of the conversation. It reflects the
   * audience, the turn counts, and the latest user message — but never the
   * raw system prompt content.
   */
  private safeEcho(request: AIChatRequest): string {
    const turns = request.messages;
    const counts = this.roleCounts(turns);
    const lastUser = this.lastUserMessage(turns);

    const lines = [
      `[mock:${this.id}] audience=${request.audience}`,
      `messages: ${turns.length} (system=${counts.system}, user=${counts.user}, assistant=${counts.assistant}, tool=${counts.tool})`,
      `system prompt: ${request.systemPrompt || counts.system > 0 ? "present (hidden)" : "none"}`,
    ];

    if (lastUser) {
      lines.push(`You said: "${this.truncate(lastUser.content, 500)}"`);
    } else {
      lines.push("No user message provided.");
    }

    lines.push("This is a deterministic mock reply — no AI provider is connected.");
    return lines.join("\n");
  }

  /* -------------------------------------------------------------- *
   * Internals (pure)
   * -------------------------------------------------------------- */

  /** Concatenate the message contents used for the prompt-token estimate. */
  private promptText(request: AIChatRequest): string {
    const sys = request.systemPrompt ? `${request.systemPrompt}\n` : "";
    return sys + request.messages.map((m) => m.content).join("\n");
  }

  /** A deterministic seed for id generation from the request contents. */
  private seedFor(request: AIChatRequest): string {
    return `${request.audience}|${request.messages.map((m) => `${m.role}:${m.content}`).join("|")}`;
  }

  private roleCounts(messages: ChatMessage[]) {
    const counts = { system: 0, user: 0, assistant: 0, tool: 0 };
    for (const m of messages) counts[m.role]++;
    return counts;
  }

  private lastUserMessage(messages: ChatMessage[]): ChatMessage | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") return messages[i];
    }
    return null;
  }

  private truncate(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  /** Split reply text into deterministic streaming chunks. */
  private chunk(text: string): string[] {
    if (!text) return [];
    if (this.streamChunkBy === "char") return Array.from(text);
    // "word" — keep the trailing space so re-joining reproduces the text.
    return text.match(/\S+\s*/g) ?? [text];
  }
}

/** Convenience factory for a ready-to-use mock provider. */
export function createMockProvider(options?: MockProviderOptions): MockProvider {
  return new MockProvider(options);
}
