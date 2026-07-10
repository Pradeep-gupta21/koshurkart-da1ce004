/**
 * KoshurKart — ConversationMemory
 * =================================================================
 * Turn-by-turn memory for a single conversation. It stores `ChatMessage`s
 * scoped to a `conversationId`, hands back a recent *window* of turns to
 * feed the model, and — when the thread grows past a threshold — folds the
 * oldest turns into a `summary` record via an injected `Summarizer`.
 *
 * This is the bridge between raw history and what an `AIService` request
 * should actually carry: `context()` returns `[summary?, ...recentTurns]`,
 * bounding prompt size without losing the gist of older turns.
 *
 * Provider-neutral: NO database, NO APIs, NO embeddings. The store and the
 * summarizer are injected; both default to offline implementations.
 */

import type { ChatMessage } from "@/ai/types/chat";
import { AIService } from "@/ai/services/ai.service";
import { BaseMemory, type BaseMemoryConfig } from "./base.memory";
import { ExtractiveSummarizer } from "./summarizer";
import {
  isMemOk,
  memOk,
  propagateError,
  type MemoryContext,
  type MemoryRecord,
  type MemoryResult,
  type MemoryScopeLevel,
  type MemorySummary,
  type Summarizer,
} from "./types";

/** Content union stored by conversation memory. */
export type ConversationItem =
  | { readonly type: "message"; readonly message: ChatMessage }
  | { readonly type: "summary"; readonly summary: MemorySummary };

/** Configuration specific to conversation memory. */
export interface ConversationMemoryConfig
  extends BaseMemoryConfig<ConversationItem> {
  /** How many recent turns to keep verbatim in the window. Default 20. */
  windowSize?: number;
  /**
   * Summarize once the verbatim turn count exceeds `windowSize` by this many
   * turns. Default 10. Older turns beyond the window are folded in.
   */
  summarizeAfterOverflow?: number;
  /** Injected summarizer. Defaults to the offline `ExtractiveSummarizer`. */
  summarizer?: Summarizer;
}

export class ConversationMemory extends BaseMemory<ConversationItem> {
  readonly id = "conversation";
  protected readonly level: MemoryScopeLevel = "conversation";

  private readonly windowSize: number;
  private readonly summarizeAfterOverflow: number;
  private readonly summarizer: Summarizer;

  constructor(config: ConversationMemoryConfig = {}) {
    super(config);
    this.windowSize = config.windowSize ?? 20;
    this.summarizeAfterOverflow = config.summarizeAfterOverflow ?? 10;
    this.summarizer = config.summarizer ?? new ExtractiveSummarizer();
  }

  /* -------------------------------------------------------------- *
   * Writing turns
   * -------------------------------------------------------------- */

  /** Append a single message to the conversation. */
  async append(
    message: ChatMessage,
    context: MemoryContext,
  ): Promise<MemoryResult<MemoryRecord<ConversationItem>>> {
    return this.write(
      "message",
      { type: "message", message },
      context,
      { tags: [message.role], metadata: { role: message.role } },
    );
  }

  /** Append several messages in order. Fails fast on the first error. */
  async appendMany(
    messages: readonly ChatMessage[],
    context: MemoryContext,
  ): Promise<MemoryResult<number>> {
    let count = 0;
    for (const message of messages) {
      const res = await this.append(message, context);
      if (!isMemOk(res)) return propagateError(res);
      count++;
    }
    return memOk(count);
  }

  /* -------------------------------------------------------------- *
   * Reading turns
   * -------------------------------------------------------------- */

  /** Every stored message for the conversation, oldest-first. */
  async messages(context: MemoryContext): Promise<ChatMessage[]> {
    const records = await this.all(context);
    return records
      .filter((r) => r.content.type === "message")
      .map((r) => (r.content as { type: "message"; message: ChatMessage }).message);
  }

  /** The most recent `windowSize` (or `n`) messages, oldest-first. */
  async window(context: MemoryContext, n?: number): Promise<ChatMessage[]> {
    const size = n ?? this.windowSize;
    const all = await this.messages(context);
    return size >= all.length ? all : all.slice(all.length - size);
  }

  /** The latest stored summary for the conversation, if any. */
  async latestSummary(
    context: MemoryContext,
  ): Promise<MemorySummary | undefined> {
    const records = await this.all(context);
    for (let i = records.length - 1; i >= 0; i--) {
      const content = records[i].content;
      if (content.type === "summary") return content.summary;
    }
    return undefined;
  }

  /**
   * The message list to actually send to a provider: the latest summary
   * (rendered as a `system` message) followed by the recent window. Bounds
   * prompt size while preserving older context.
   */
  async context(
    context: MemoryContext,
    n?: number,
  ): Promise<ChatMessage[]> {
    const window = await this.window(context, n);
    const summary = await this.latestSummary(context);
    if (!summary || !summary.text) return window;

    const summaryMessage = AIService.createMessage(
      "system",
      `Summary of earlier conversation:\n${summary.text}`,
      { metadata: { kind: "summary", messageCount: summary.messageCount } },
    );
    return [summaryMessage, ...window];
  }

  /* -------------------------------------------------------------- *
   * Compaction
   * -------------------------------------------------------------- */

  /**
   * Summarize older turns when the thread has overflowed the window by more
   * than `summarizeAfterOverflow`. Folds the overflow messages into a new
   * `summary` record and removes their verbatim copies. Idempotent-ish: a
   * no-op (returns `undefined`) when there's nothing to compact.
   */
  async maybeCompact(
    context: MemoryContext,
  ): Promise<MemoryResult<MemorySummary | undefined>> {
    const records = await this.all(context);
    const messageRecords = records.filter((r) => r.content.type === "message");

    const overflow = messageRecords.length - this.windowSize;
    if (overflow < this.summarizeAfterOverflow) return memOk(undefined);

    const toFold = messageRecords.slice(0, overflow);
    const foldedMessages = toFold.map(
      (r) => (r.content as { type: "message"; message: ChatMessage }).message,
    );

    const summary = await this.summarizer.summarize(foldedMessages, {
      audience: context.audience,
    });

    // Merge with any prior summary so we never lose earlier context.
    const prior = await this.latestSummary(context);
    const merged: MemorySummary = prior
      ? {
          text: `${prior.text}\n${summary.text}`.trim(),
          messageCount: prior.messageCount + summary.messageCount,
          coveredIds: [...prior.coveredIds, ...summary.coveredIds],
        }
      : summary;

    const written = await this.write(
      "summary",
      { type: "summary", summary: merged },
      context,
      { importance: 2, tags: ["summary"] },
    );
    if (!isMemOk(written)) return propagateError(written);

    // Drop the now-summarized verbatim turns and any superseded summary.
    for (const record of toFold) await this.remove(record.id);
    if (prior) {
      const priorRecord = records.find(
        (r) => r.content.type === "summary",
      );
      if (priorRecord) await this.remove(priorRecord.id);
    }

    return memOk(merged);
  }
}

/** Convenience factory mirroring the providers/tools/planner module style. */
export function createConversationMemory(
  config?: ConversationMemoryConfig,
): ConversationMemory {
  return new ConversationMemory(config);
}
