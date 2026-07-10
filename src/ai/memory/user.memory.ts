/**
 * KoshurKart — UserMemory
 * =================================================================
 * Durable, cross-conversation memory about a single user: the facts,
 * preferences, and notes an agent should recall in any future thread. Scoped
 * to a `userId`, it outlives sessions and conversations.
 *
 * This is where an agent keeps things like "prefers concise answers" or
 * "asked about pashmina care twice" — provider-neutral records only. There
 * is deliberately NO marketplace-specific schema here: content is generic
 * `fact` / `preference` / `note` text with tags, so any surface (customer,
 * vendor, admin) can reuse it without this module knowing their domains.
 *
 * Provider-neutral: NO database, NO Supabase, NO APIs, NO embeddings. Backed
 * by the injected `MemoryStore` (in-memory by default).
 */

import { BaseMemory, type BaseMemoryConfig } from "./base.memory";
import {
  memErr,
  memOk,
  type MemoryContext,
  type MemoryRecord,
  type MemoryResult,
  type MemoryScopeLevel,
} from "./types";

/** Content shape of a durable user record. */
export interface UserFact {
  /** The statement or note text. */
  text: string;
  /**
   * Optional preference key when this record captures a keyed setting
   * (e.g. `tone`, `language`). Present on `preference` records.
   */
  key?: string;
}

/** Options when remembering a fact/preference/note. */
export interface RememberOptions {
  /** Ranking weight for retrieval; higher = recalled sooner. Default 1. */
  importance?: number;
  /** Tags for filtering and lexical retrieval. */
  tags?: readonly string[];
}

export class UserMemory extends BaseMemory<UserFact> {
  readonly id = "user";
  protected readonly level: MemoryScopeLevel = "user";

  constructor(config: BaseMemoryConfig<UserFact> = {}) {
    super(config);
  }

  /* -------------------------------------------------------------- *
   * Facts & notes
   * -------------------------------------------------------------- */

  /** Store a durable fact about the user. */
  async rememberFact(
    text: string,
    context: MemoryContext,
    options: RememberOptions = {},
  ): Promise<MemoryResult<MemoryRecord<UserFact>>> {
    if (!text) return memErr({ code: "invalid_input", message: "text is required." });
    return this.write("fact", { text }, context, {
      importance: options.importance,
      tags: options.tags,
    });
  }

  /** Store a free-form note the agent chose to keep. */
  async rememberNote(
    text: string,
    context: MemoryContext,
    options: RememberOptions = {},
  ): Promise<MemoryResult<MemoryRecord<UserFact>>> {
    if (!text) return memErr({ code: "invalid_input", message: "text is required." });
    return this.write("note", { text }, context, {
      importance: options.importance,
      tags: options.tags,
    });
  }

  /* -------------------------------------------------------------- *
   * Preferences (keyed, upserted)
   * -------------------------------------------------------------- */

  /**
   * Set a keyed preference, overwriting any prior value for the same key so
   * preferences don't accumulate duplicates.
   */
  async setPreference(
    key: string,
    value: string,
    context: MemoryContext,
    options: RememberOptions = {},
  ): Promise<MemoryResult<MemoryRecord<UserFact>>> {
    if (!key) return memErr({ code: "invalid_input", message: "key is required." });

    const existing = await this.findPreference(key, context);
    if (existing) {
      return this.patch(
        existing.id,
        { content: { text: value, key }, tags: options.tags ?? existing.tags },
        context,
      );
    }
    return this.write("preference", { text: value, key }, context, {
      importance: options.importance,
      tags: options.tags ?? [key],
    });
  }

  /** Read a keyed preference value, or `undefined` when unset. */
  async getPreference(
    key: string,
    context: MemoryContext,
  ): Promise<string | undefined> {
    const record = await this.findPreference(key, context);
    return record?.content.text;
  }

  /** All keyed preferences as a plain object. */
  async preferences(context: MemoryContext): Promise<Record<string, string>> {
    const records = await this.all(context);
    const out: Record<string, string> = {};
    for (const r of records) {
      if (r.kind === "preference" && r.content.key) {
        out[r.content.key] = r.content.text;
      }
    }
    return out;
  }

  /* -------------------------------------------------------------- *
   * Reading
   * -------------------------------------------------------------- */

  /** Every durable record for the user, oldest-first. */
  async list(context: MemoryContext): Promise<MemoryRecord<UserFact>[]> {
    return this.all(context);
  }

  /** Facts + notes (excludes preferences) as plain text lines. */
  async facts(context: MemoryContext): Promise<string[]> {
    const records = await this.all(context);
    return records
      .filter((r) => r.kind === "fact" || r.kind === "note")
      .map((r) => r.content.text);
  }

  /** Forget a single record by id. */
  async forget(id: string): Promise<MemoryResult<boolean>> {
    const removed = await this.remove(id);
    return removed
      ? memOk(true)
      : memErr({ code: "not_found", message: `No record "${id}".` });
  }

  /* -------------------------------------------------------------- *
   * Internals
   * -------------------------------------------------------------- */

  /** Locate the record backing a preference key within the user scope. */
  private async findPreference(key: string, context: MemoryContext) {
    const records = await this.all(context);
    for (let i = records.length - 1; i >= 0; i--) {
      const r = records[i];
      if (r.kind === "preference" && r.content.key === key) return r;
    }
    return undefined;
  }
}

/** Convenience factory mirroring the providers/tools/planner module style. */
export function createUserMemory(
  config?: BaseMemoryConfig<UserFact>,
): UserMemory {
  return new UserMemory(config);
}
