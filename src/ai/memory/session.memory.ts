/**
 * KoshurKart — SessionMemory
 * =================================================================
 * Ephemeral, per-session scratch space: a strongly-typed key/value store
 * scoped to a single `sessionId`. Agents stash transient working state here
 * — the current step, a pending clarification, a draft — that should live
 * for the session but never persist beyond it.
 *
 * Built on `BaseMemory`; stores `state` records whose content is a
 * `{ key, value }` entry. Provider-neutral: NO database, NO APIs — the
 * in-memory store (or an injected one) backs it.
 */

import { BaseMemory, type BaseMemoryConfig } from "./base.memory";
import {
  isMemOk,
  memErr,
  memOk,
  propagateError,
  type MemoryContext,
  type MemoryResult,
  type MemoryScopeLevel,
} from "./types";

/** The content shape of a session `state` record. */
export interface SessionEntry<V = unknown> {
  /** Logical key within the session namespace. */
  key: string;
  /** Arbitrary JSON-serializable value. */
  value: V;
}

export class SessionMemory<V = unknown> extends BaseMemory<SessionEntry<V>> {
  readonly id = "session";
  protected readonly level: MemoryScopeLevel = "session";

  constructor(config: BaseMemoryConfig<SessionEntry<V>> = {}) {
    super(config);
  }

  /**
   * Set (create or overwrite) a value under `key` for the current session.
   * Overwrite is by logical key, not record id, so repeated sets don't grow
   * the store.
   */
  async set(
    key: string,
    value: V,
    context: MemoryContext,
  ): Promise<MemoryResult<SessionEntry<V>>> {
    if (!key) return memErr({ code: "invalid_input", message: "key is required." });

    const existing = await this.findByKey(key, context);
    if (existing) {
      const patched = await this.patch(
        existing.id,
        { content: { key, value } },
        context,
      );
      return isMemOk(patched)
        ? memOk(patched.data.content)
        : propagateError(patched);
    }

    const written = await this.write("state", { key, value }, context, {
      tags: [key],
    });
    return isMemOk(written)
      ? memOk(written.data.content)
      : propagateError(written);
  }

  /** Read a value by key, or `undefined` when unset. */
  async get(key: string, context: MemoryContext): Promise<V | undefined> {
    const record = await this.findByKey(key, context);
    return record?.content.value;
  }

  /** Whether a key is currently set for this session. */
  async has(key: string, context: MemoryContext): Promise<boolean> {
    return (await this.findByKey(key, context)) !== undefined;
  }

  /** Delete a key. Returns true if it existed. */
  async delete(key: string, context: MemoryContext): Promise<boolean> {
    const record = await this.findByKey(key, context);
    if (!record) return false;
    return this.remove(record.id);
  }

  /** All entries for the session as a plain object snapshot. */
  async snapshot(context: MemoryContext): Promise<Record<string, V>> {
    const records = await this.all(context);
    const out: Record<string, V> = {};
    // Later writes win: records are createdAt-ascending.
    for (const r of records) out[r.content.key] = r.content.value;
    return out;
  }

  /* -------------------------------------------------------------- *
   * Internals
   * -------------------------------------------------------------- */

  /** Locate the record backing a logical key within the current scope. */
  private async findByKey(key: string, context: MemoryContext) {
    const records = await this.all(context);
    // Last match wins if duplicates ever exist.
    for (let i = records.length - 1; i >= 0; i--) {
      if (records[i].content.key === key) return records[i];
    }
    return undefined;
  }
}

/** Convenience factory mirroring the providers/tools/planner module style. */
export function createSessionMemory<V = unknown>(
  config?: BaseMemoryConfig<SessionEntry<V>>,
): SessionMemory<V> {
  return new SessionMemory<V>(config);
}
