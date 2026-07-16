import type { SupabaseClient } from "@supabase/supabase-js";
import type { MemoryRecord, MemoryStore, MemoryKind } from "./types";

/**
 * KoshurKart — SupabaseMemoryStore
 * =================================================================
 * A concrete implementation of the `MemoryStore` interface that persists AI memory
 * records (facts, summaries, preferences) to PostgreSQL using Supabase.
 *
 * It seamlessly replaces `InMemoryStore` via dependency injection to provide
 * durability across stateless Edge Function invocations.
 */
export class SupabaseMemoryStore<T = any> implements MemoryStore<MemoryRecord<T>> {
  constructor(private readonly supabase: SupabaseClient) {}

  async put(id: string, value: MemoryRecord<T>): Promise<void> {
    const { error } = await this.supabase.from("agent_memory").upsert({
      id: value.id,
      kind: value.kind,
      scope_level: value.scope.level,
      scope_key: value.scope.key,
      scope_audience: value.scope.audience ?? null,
      content: value.content,
      importance: value.importance ?? null,
      tags: value.tags ?? null,
      metadata: value.metadata ?? null,
      created_at: value.createdAt,
      updated_at: value.updatedAt,
    });
    
    if (error) {
      throw new Error(`SupabaseMemoryStore.put failed: ${error.message}`);
    }
  }

  async get(id: string): Promise<MemoryRecord<T> | undefined> {
    const { data, error } = await this.supabase
      .from("agent_memory")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new Error(`SupabaseMemoryStore.get failed: ${error.message}`);
    }
    
    if (!data) return undefined;
    
    return this.mapRow(data);
  }

  async values(scopeKey?: string): Promise<MemoryRecord<T>[]> {
    let query = this.supabase.from("agent_memory").select("*");
    
    if (scopeKey) {
      query = query.eq("scope_key", scopeKey);
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw new Error(`SupabaseMemoryStore.values failed: ${error.message}`);
    }
    
    return data.map((row) => this.mapRow(row));
  }

  async delete(id: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from("agent_memory")
      .delete()
      .eq("id", id)
      .select("id");
      
    if (error) {
      throw new Error(`SupabaseMemoryStore.delete failed: ${error.message}`);
    }
    
    return data && data.length > 0;
  }

  async clear(): Promise<void> {
    const { error } = await this.supabase
      .from("agent_memory")
      .delete()
      .neq("id", ""); // Supabase requires a filter to prevent accidental full table drops
      
    if (error) {
      throw new Error(`SupabaseMemoryStore.clear failed: ${error.message}`);
    }
  }

  private mapRow(row: any): MemoryRecord<T> {
    return {
      id: row.id,
      kind: row.kind as MemoryKind,
      scope: {
        level: row.scope_level as any,
        key: row.scope_key as string,
        audience: row.scope_audience ?? undefined,
      },
      content: row.content as T,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      importance: row.importance ? Number(row.importance) : undefined,
      tags: row.tags ?? undefined,
      metadata: row.metadata ?? undefined,
    };
  }
}

