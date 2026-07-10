/**
 * KoshurKart — RetrievalMemory
 * =================================================================
 * A searchable memory over arbitrary records, ranked WITHOUT embeddings.
 * Retrieval is purely lexical/structural: keyword overlap against content
 * and tags, blended with recency and a record's `importance` weight. This
 * keeps the memory system fully offline and deterministic while still giving
 * agents a "recall the most relevant notes" capability.
 *
 * The scoring function is a pluggable `RetrievalStrategy` (DI-friendly, like
 * the planner's `RetryStrategy`); the default is exported here. Records are
 * stored through the same `BaseMemory` plumbing, so the backing store is the
 * usual injected seam.
 *
 * Provider-neutral: NO database, NO Supabase, NO APIs, NO embeddings, NO
 * marketplace specifics.
 */

import { BaseMemory, type BaseMemoryConfig } from "./base.memory";
import {
  type AnyMemoryRecord,
  type MemoryContext,
  type MemoryKind,
  type MemoryQuery,
  type MemoryRecord,
  type MemoryResult,
  type MemoryScopeLevel,
  type RetrievalScoringContext,
  type RetrievalStrategy,
  type ScoredMemory,
} from "./types";

/** The content a retrieval record carries — free text plus optional data. */
export interface RetrievableItem<T = unknown> {
  /** The text that lexical search matches against. */
  text: string;
  /** Optional structured payload returned alongside the match. */
  data?: T;
}

/** Tuning for the default lexical scorer. */
export interface KeywordRecencyOptions {
  /** Weight of lexical keyword overlap. Default 1. */
  keywordWeight?: number;
  /** Weight of the record's `importance`. Default 0.5. */
  importanceWeight?: number;
  /** Weight of recency (newer scores higher). Default 0.25. */
  recencyWeight?: number;
  /**
   * Half-life in milliseconds for the recency term — a record this old
   * contributes half its recency weight. Default 1 day.
   */
  recencyHalfLifeMs?: number;
}

/**
 * The default, embedding-free retrieval strategy: token-overlap between the
 * query and a record's text/tags, plus importance and an exponential recency
 * decay. Pure and deterministic given its scoring context.
 */
export function createKeywordRecencyStrategy(
  options: KeywordRecencyOptions = {},
): RetrievalStrategy {
  const keywordWeight = options.keywordWeight ?? 1;
  const importanceWeight = options.importanceWeight ?? 0.5;
  const recencyWeight = options.recencyWeight ?? 0.25;
  const halfLife = options.recencyHalfLifeMs ?? 24 * 60 * 60 * 1000;

  return {
    score(record, query, context): number {
      const haystack = tokenize(textOf(record)).concat(
        (record.tags ?? []).map((t) => t.toLowerCase()),
      );
      const haySet = new Set(haystack);

      // Keyword overlap: fraction of query tokens present in the record.
      let overlap = 0;
      for (const term of context.queryTokens) {
        if (haySet.has(term)) overlap++;
      }
      const keyword =
        context.queryTokens.length > 0
          ? overlap / context.queryTokens.length
          : 0;

      // If the caller supplied text but nothing matched, exclude the record.
      if (context.queryTokens.length > 0 && overlap === 0) return 0;

      const importance = Math.max(0, record.importance ?? 1);

      // Exponential recency decay in [0, 1].
      const ageMs = Math.max(0, context.now - record.createdAt);
      const recency = Math.pow(0.5, ageMs / halfLife);

      return (
        keyword * keywordWeight +
        importance * importanceWeight +
        recency * recencyWeight
      );
    },
  };
}

export class RetrievalMemory<T = unknown> extends BaseMemory<
  RetrievableItem<T>
> {
  readonly id = "retrieval";
  // Retrieval indexes across scopes; callers narrow via `MemoryQuery.scopeKey`.
  protected readonly level: MemoryScopeLevel = "user";

  private readonly strategy: RetrievalStrategy;

  constructor(
    config: BaseMemoryConfig<RetrievableItem<T>> & {
      strategy?: RetrievalStrategy;
    } = {},
  ) {
    super(config);
    this.strategy = config.strategy ?? createKeywordRecencyStrategy();
  }

  /**
   * Index a retrievable item. `kind` defaults to `note`; pass a specific
   * kind (`fact`, `summary`, …) to make it filterable by `query.kinds`.
   */
  async index(
    item: RetrievableItem<T>,
    context: MemoryContext,
    options: {
      kind?: MemoryKind;
      importance?: number;
      tags?: readonly string[];
    } = {},
  ): Promise<MemoryResult<MemoryRecord<RetrievableItem<T>>>> {
    return this.write(options.kind ?? "note", item, context, {
      importance: options.importance,
      tags: options.tags,
    });
  }

  /**
   * Search indexed records with the configured strategy. Returns matches
   * ranked highest-score-first, honoring the query's `kinds`, `tags`,
   * `scopeKey`, `since`, and `limit` filters.
   */
  async search(
    query: MemoryQuery,
    context: MemoryContext,
  ): Promise<ScoredMemory<RetrievableItem<T>>[]> {
    const all = await this.store.values();
    const now = this.now(context);
    const queryTokens = query.text ? tokenize(query.text) : [];
    const scoringContext: RetrievalScoringContext = { now, queryTokens };

    const scored: ScoredMemory<RetrievableItem<T>>[] = [];
    for (const record of all) {
      if (!this.matchesFilters(record, query)) continue;
      const score = this.strategy.score(
        record as AnyMemoryRecord,
        query,
        scoringContext,
      );
      if (score > 0) scored.push({ record, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return query.limit && query.limit > 0
      ? scored.slice(0, query.limit)
      : scored;
  }

  /* -------------------------------------------------------------- *
   * Internals
   * -------------------------------------------------------------- */

  /** Structural (non-scoring) filters applied before the strategy runs. */
  private matchesFilters(
    record: MemoryRecord<RetrievableItem<T>>,
    query: MemoryQuery,
  ): boolean {
    if (query.scopeKey && record.scope.key !== query.scopeKey) return false;
    if (query.kinds && !query.kinds.includes(record.kind)) return false;
    if (query.since && record.createdAt < query.since) return false;
    if (query.tags && query.tags.length > 0) {
      const tags = new Set(record.tags ?? []);
      const hasAny = query.tags.some((t) => tags.has(t));
      if (!hasAny) return false;
    }
    return true;
  }
}

/* ------------------------------------------------------------------ *
 * Shared lexical helpers
 * ------------------------------------------------------------------ */

/** Extract the searchable text from any record (retrievable or otherwise). */
function textOf(record: AnyMemoryRecord): string {
  const content = record.content;
  if (typeof content === "string") return content;
  if (content && typeof content === "object") {
    const maybe = content as { text?: unknown };
    if (typeof maybe.text === "string") return maybe.text;
    try {
      return JSON.stringify(content);
    } catch {
      return "";
    }
  }
  return content == null ? "" : String(content);
}

/** Lowercase, split on non-word characters, drop empties. Pure. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length > 0);
}

/** Convenience factory mirroring the providers/tools/planner module style. */
export function createRetrievalMemory<T = unknown>(
  config?: BaseMemoryConfig<RetrievableItem<T>> & {
    strategy?: RetrievalStrategy;
  },
): RetrievalMemory<T> {
  return new RetrievalMemory<T>(config);
}
