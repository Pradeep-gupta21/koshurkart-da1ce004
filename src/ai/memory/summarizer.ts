/**
 * KoshurKart — Memory summarizers
 * =================================================================
 * Implementations of the `Summarizer` contract that compress a batch of
 * `ChatMessage`s into a `MemorySummary`. Summarization is what lets
 * `ConversationMemory` keep prompts bounded without discarding older context.
 *
 * Two implementations ship:
 *  - `ExtractiveSummarizer` (default) — fully deterministic and OFFLINE. It
 *    performs NO API call: it selects and truncates salient turns using
 *    simple heuristics. This is the provider-agnostic default the memory
 *    system uses out of the box.
 *  - `AISummarizer` — an OPTIONAL adapter that delegates to an injected
 *    `AIService`. It makes no network call itself; whether anything leaves
 *    the process depends entirely on the provider wired into that service
 *    (with the in-repo `MockProvider` it stays offline). This mirrors how
 *    the planner references `AIService` by injection.
 *
 * Provider-neutral: NO database, NO embeddings, NO marketplace specifics.
 */

import type { ChatMessage } from "@/ai/types/chat";
import type { AIService } from "@/ai/services/ai.service";
import type { MemorySummary, Summarizer, SummarizeOptions } from "./types";

/* ------------------------------------------------------------------ *
 * Extractive (default, offline, deterministic)
 * ------------------------------------------------------------------ */

/** Options for the extractive summarizer. */
export interface ExtractiveSummarizerOptions {
  /** Default character budget when a call omits `maxChars`. Default 600. */
  maxChars?: number;
  /** How many leading turns to always keep. Default 1. */
  headTurns?: number;
  /** How many trailing turns to always keep. Default 3. */
  tailTurns?: number;
}

/**
 * A deterministic, dependency-free summarizer. It keeps the first `headTurns`
 * and last `tailTurns` messages (the ones most likely to carry intent and
 * the latest state), renders them as `role: text` lines, and truncates the
 * whole thing to the character budget. No AI, no clock, no randomness.
 */
export class ExtractiveSummarizer implements Summarizer {
  readonly id = "extractive";

  private readonly maxChars: number;
  private readonly headTurns: number;
  private readonly tailTurns: number;

  constructor(options: ExtractiveSummarizerOptions = {}) {
    this.maxChars = options.maxChars ?? 600;
    this.headTurns = options.headTurns ?? 1;
    this.tailTurns = options.tailTurns ?? 3;
  }

  async summarize(
    messages: readonly ChatMessage[],
    options: SummarizeOptions = {},
  ): Promise<MemorySummary> {
    const budget = options.maxChars ?? this.maxChars;
    const selected = this.select(messages);

    const body = selected
      .map((m) => `${m.role}: ${collapse(m.content)}`)
      .filter((line) => line.trim().length > 0)
      .join("\n");

    return {
      text: truncate(body, budget),
      messageCount: messages.length,
      coveredIds: messages.map((m) => m.id),
    };
  }

  /** Pick head + tail turns, de-duplicated, preserving order. */
  private select(messages: readonly ChatMessage[]): ChatMessage[] {
    if (messages.length <= this.headTurns + this.tailTurns) {
      return [...messages];
    }
    const head = messages.slice(0, this.headTurns);
    const tail = messages.slice(messages.length - this.tailTurns);
    const seen = new Set(head.map((m) => m.id));
    const merged = [...head];
    for (const m of tail) {
      if (!seen.has(m.id)) merged.push(m);
    }
    return merged;
  }
}

/* ------------------------------------------------------------------ *
 * AI-backed (optional, injected AIService)
 * ------------------------------------------------------------------ */

/** Options for the AI-backed summarizer. */
export interface AISummarizerOptions {
  /** Default character budget when a call omits `maxChars`. Default 600. */
  maxChars?: number;
  /**
   * Instruction prepended to the transcript. Kept generic and free of any
   * marketplace specifics.
   */
  instruction?: string;
  /**
   * Fallback used if the service returns nothing usable. Defaults to an
   * `ExtractiveSummarizer`, so this adapter degrades gracefully offline.
   */
  fallback?: Summarizer;
}

/**
 * A `Summarizer` that asks an injected `AIService` to produce the digest.
 * It performs no network I/O of its own — the service's provider does
 * whatever it does (offline with the repo's `MockProvider`). If the service
 * errors or returns empty text, it falls back to the extractive summarizer.
 */
export class AISummarizer implements Summarizer {
  readonly id = "ai";

  private readonly maxChars: number;
  private readonly instruction: string;
  private readonly fallback: Summarizer;

  constructor(
    /** Injected reasoning service. Referenced by type only. */
    private readonly service: AIService,
    options: AISummarizerOptions = {},
  ) {
    this.maxChars = options.maxChars ?? 600;
    this.instruction =
      options.instruction ??
      "Summarize the following conversation concisely, preserving the user's " +
        "intent, key facts, and any unresolved questions. Do not add new information.";
    this.fallback = options.fallback ?? new ExtractiveSummarizer();
  }

  async summarize(
    messages: readonly ChatMessage[],
    options: SummarizeOptions = {},
  ): Promise<MemorySummary> {
    const audience = options.audience ?? "customer";
    const transcript = messages
      .map((m) => `${m.role}: ${collapse(m.content)}`)
      .join("\n");
    const prompt = `${this.instruction}\n\n${transcript}`;

    try {
      const response = await this.service.chat({
        audience,
        messages: [
          {
            id: `summarize-${messages.length}`,
            role: "user",
            content: prompt,
            createdAt: 0,
          },
        ],
        options: { maxTokens: 512 },
      });

      const text = truncate(
        (response.message.content ?? "").trim(),
        options.maxChars ?? this.maxChars,
      );
      if (!text) return this.fallback.summarize(messages, options);

      return {
        text,
        messageCount: messages.length,
        coveredIds: messages.map((m) => m.id),
      };
    } catch {
      // Any failure degrades to the deterministic offline summarizer.
      return this.fallback.summarize(messages, options);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Factory & helpers
 * ------------------------------------------------------------------ */

/**
 * Build the default summarizer (extractive, offline). Pass an `AIService`
 * to opt into AI-backed summarization instead.
 */
export function createSummarizer(service?: AIService): Summarizer {
  return service ? new AISummarizer(service) : new ExtractiveSummarizer();
}

/** Collapse internal whitespace/newlines so a turn renders on one line. */
function collapse(text: string): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** Hard-truncate to a character budget with an ellipsis. */
function truncate(text: string, max: number): string {
  if (max <= 0 || text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}
