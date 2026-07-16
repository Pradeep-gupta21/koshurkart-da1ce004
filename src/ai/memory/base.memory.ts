/**
 * KoshurKart — BaseMemory
 * =================================================================
 * Abstract base class that implements the shared plumbing every memory
 * (see src/ai/memory/types.ts) needs, so concrete memories only declare
 * their record content type and add domain methods.
 *
 * What the base provides:
 *  - a `MemoryStore` seam with an in-memory default (`InMemoryStore`) — the
 *    single reason this framework needs NO database to run;
 *  - typed record CRUD (`write` / `read` / `all` / `remove`) that stamps
 *    ids and timestamps from the injected clock;
 *  - scope filtering so many entities share one backing store safely;
 *  - a capacity policy that evicts the least-recently-updated records;
 *  - `clearScope()` from the `Memory` contract.
 *
 * It is deliberately provider-neutral: NO database, NO Supabase, NO network,
 * NO API keys, NO embeddings, NO marketplace specifics. Real backends are
 * injected via the `MemoryStore` seam; every memory stays testable.
 */

import type { ChatAudience } from "@/ai/types/chat";
import {
  memErr,
  memOk,
  type AnyMemoryRecord,
  type Memory,
  type MemoryContext,
  type MemoryKind,
  type MemoryRecord,
  type MemoryResult,
  type MemoryScope,
  type MemoryScopeLevel,
  type MemoryStore,
} from "./types";

/**
 * Default `MemoryStore`: a process-local `Map`. Deterministic, dependency
 * free, and the reason the memory system runs with no external store. Swap
 * it for a real adapter at construction time — nothing else changes.
 */
export class InMemoryStore<T> implements MemoryStore<T> {
  private readonly map = new Map<string, T>();

  async put(id: string, value: T): Promise<void> {
    this.map.set(id, value);
  }
  async get(id: string): Promise<T | undefined> {
    return this.map.get(id);
  }
  async values(scopeKey?: string): Promise<T[]> {
    return [...this.map.values()];
  }
  async delete(id: string): Promise<boolean> {
    return this.map.delete(id);
  }
  async clear(): Promise<void> {
    this.map.clear();
  }
}

/** Construction-time configuration shared by all memories. */
export interface BaseMemoryConfig<T> {
  /** Backing store. Defaults to a fresh `InMemoryStore`. */
  store?: MemoryStore<MemoryRecord<T>>;
  /**
   * Max records retained per scope key. When exceeded, the
   * least-recently-updated records in that scope are evicted. `0`/omitted
   * means unbounded.
   */
  capacityPerScope?: number;
}

export abstract class BaseMemory<T> implements Memory {
  /** Stable identifier, e.g. "conversation". */
  abstract readonly id: string;

  /** The lifetime this memory manages — drives which context id is used. */
  protected abstract readonly level: MemoryScopeLevel;

  /** Backing store (injected or the in-memory default). */
  protected readonly store: MemoryStore<MemoryRecord<T>>;

  /** Per-scope retention cap; 0 = unbounded. */
  protected readonly capacityPerScope: number;

  constructor(config: BaseMemoryConfig<T> = {}) {
    this.store = config.store ?? new InMemoryStore<MemoryRecord<T>>();
    this.capacityPerScope = config.capacityPerScope ?? 0;
  }

  /* -------------------------------------------------------------- *
   * Core CRUD (protected — concrete memories expose typed methods)
   * -------------------------------------------------------------- */

  /**
   * Persist a new record for the scope implied by `context`. Stamps id and
   * timestamps from the injected clock, then enforces the capacity policy.
   */
  protected async write(
    kind: MemoryKind,
    content: T,
    context: MemoryContext,
    extra?: Partial<
      Pick<MemoryRecord<T>, "importance" | "tags" | "metadata">
    >,
  ): Promise<MemoryResult<MemoryRecord<T>>> {
    const scope = this.scopeFor(context);
    if (!scope) {
      return memErr(
        {
          code: "invalid_input",
          message: `Memory "${this.id}" requires a ${this.level} id in context.`,
          retryable: false,
        },
      );
    }

    const ts = this.now(context);
    const record: MemoryRecord<T> = {
      id: this.generateId(kind),
      kind,
      scope,
      content,
      createdAt: ts,
      updatedAt: ts,
      importance: extra?.importance,
      tags: extra?.tags,
      metadata: extra?.metadata,
    };

    await this.store.put(record.id, record);
    await this.enforceCapacity(scope.key);
    return memOk(record);
  }

  /** Fetch a single record by id, validating it belongs to the scope. */
  protected async read(
    id: string,
    context: MemoryContext,
  ): Promise<MemoryResult<MemoryRecord<T>>> {
    const found = await this.store.get(id);
    if (!found) {
      return memErr({
        code: "not_found",
        message: `No record "${id}" in memory "${this.id}".`,
        retryable: false,
      });
    }
    const scopeKey = this.scopeKey(context);
    if (scopeKey && found.scope.key !== scopeKey) {
      return memErr({
        code: "not_found",
        message: `Record "${id}" is not in the current ${this.level} scope.`,
        retryable: false,
      });
    }
    return memOk(found);
  }

  /**
   * All records for the current scope, oldest-first by `createdAt`. When the
   * context carries no scope id, returns every record (useful for unscoped
   * inspection/tests).
   */
  protected async all(context: MemoryContext): Promise<MemoryRecord<T>[]> {
    const scopeKey = this.scopeKey(context);
    const values = await this.store.values(scopeKey);
    const filtered = scopeKey
      ? values.filter((r) => r.scope.key === scopeKey)
      : values;
    return filtered.sort((a, b) => a.createdAt - b.createdAt);
  }

  /** Remove a single record by id. Returns whether it existed. */
  protected async remove(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  /**
   * Update an existing record's mutable fields, bumping `updatedAt`. Missing
   * ids fail with `not_found`.
   */
  protected async patch(
    id: string,
    changes: Partial<Pick<MemoryRecord<T>, "content" | "importance" | "tags" | "metadata">>,
    context: MemoryContext,
  ): Promise<MemoryResult<MemoryRecord<T>>> {
    const existing = await this.store.get(id);
    if (!existing) {
      return memErr({
        code: "not_found",
        message: `No record "${id}" to patch in memory "${this.id}".`,
        retryable: false,
      });
    }
    const next: MemoryRecord<T> = {
      ...existing,
      ...changes,
      updatedAt: this.now(context),
    };
    await this.store.put(id, next);
    return memOk(next);
  }

  /* -------------------------------------------------------------- *
   * Memory contract
   * -------------------------------------------------------------- */

  /** Remove every record for the current scope. Returns the count removed. */
  async clearScope(context: MemoryContext): Promise<MemoryResult<number>> {
    const scopeKey = this.scopeKey(context);
    if (!scopeKey) {
      // Unscoped clear wipes the whole store — supported for tests/tools.
      const size = (await this.store.values()).length;
      await this.store.clear();
      return memOk(size);
    }
    const victims = (await this.store.values(scopeKey)).filter(
      (r) => r.scope.key === scopeKey,
    );
    for (const record of victims) await this.store.delete(record.id);
    return memOk(victims.length);
  }

  /* -------------------------------------------------------------- *
   * Scope helpers
   * -------------------------------------------------------------- */

  /** The scope id for this memory's level from the context, if present. */
  protected scopeKey(context: MemoryContext): string | undefined {
    switch (this.level) {
      case "session":
        return context.sessionId;
      case "conversation":
        return context.conversationId;
      case "user":
        return context.userId;
      default:
        return undefined;
    }
  }

  /** Build a full `MemoryScope` from context, or `null` if the id is absent. */
  protected scopeFor(context: MemoryContext): MemoryScope | null {
    const key = this.scopeKey(context);
    if (!key) return null;
    return { level: this.level, key, audience: context.audience };
  }

  /* -------------------------------------------------------------- *
   * Internals
   * -------------------------------------------------------------- */

  /**
   * Evict the least-recently-updated records once a scope exceeds capacity.
   * No-op when unbounded. Runs after each write.
   */
  protected async enforceCapacity(scopeKey: string): Promise<void> {
    if (this.capacityPerScope <= 0) return;
    const inScope = (await this.store.values(scopeKey))
      .filter((r) => r.scope.key === scopeKey)
      .sort((a, b) => a.updatedAt - b.updatedAt); // oldest first
    const overflow = inScope.length - this.capacityPerScope;
    for (let i = 0; i < overflow; i++) {
      await this.store.delete(inScope[i].id);
    }
  }

  /** Injected clock, defaulting to 0 so behavior stays deterministic. */
  protected now(context: MemoryContext): number {
    return context.now ? context.now() : 0;
  }

  /**
   * Generate a unique id. Prefers `crypto.randomUUID` when available, else a
   * timestamped random string — matching `AIService.generateId`. Kept
   * dependency-free.
   */
  protected generateId(kind: string): string {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
    const suffix = c?.randomUUID
      ? c.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return `${this.id}-${kind}-${suffix}`;
  }

  /** Narrow helper so subclasses can treat any record uniformly if needed. */
  protected asAny(record: MemoryRecord<T>): AnyMemoryRecord {
    return record as AnyMemoryRecord;
  }

  /** Convenience: the audience carried by the context, if any. */
  protected audienceOf(context: MemoryContext): ChatAudience | undefined {
    return context.audience;
  }
}
