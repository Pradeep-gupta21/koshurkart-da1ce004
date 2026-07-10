import type { SupabaseClient } from "@supabase/supabase-js";
import type { Job, JobStore, EnqueueOptions, JobStatus } from "./types";

export class SupabaseJobStore implements JobStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async enqueue<TPayload>(type: string, payload: TPayload, options?: EnqueueOptions): Promise<string> {
    const nextRunAt = new Date(Date.now() + (options?.delayMs ?? 0)).toISOString();
    
    const { data, error } = await this.supabase
      .from("agent_jobs")
      .insert({
        type,
        payload,
        max_retries: options?.maxRetries ?? 3,
        next_run_at: nextRunAt
      })
      .select("id")
      .single();

    if (error || !data) {
      throw new Error(`Failed to enqueue job: ${error?.message || "Unknown error"}`);
    }
    return data.id;
  }

  async getJob<TPayload, TResult>(id: string): Promise<Job<TPayload, TResult> | null> {
    const { data, error } = await this.supabase
      .from("agent_jobs")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) return null;
    return this.mapToJob<TPayload, TResult>(data);
  }

  async cancelJob(id: string): Promise<void> {
    const { error } = await this.supabase
      .from("agent_jobs")
      .update({ status: 'cancelled' })
      .eq("id", id)
      .in("status", ["pending", "running"]); // Only cancel if it's not already terminal

    if (error) {
      throw new Error(`Failed to cancel job: ${error.message}`);
    }
  }

  async claimNextJob(types: string[]): Promise<Job | null> {
    // Atomic claim via PostgreSQL RPC using FOR UPDATE SKIP LOCKED.
    // The database function finds one pending job whose next_run_at has passed,
    // locks it exclusively (skipping already-locked rows), transitions it to
    // 'running', and returns the full row — all within a single transaction.
    const { data, error } = await this.supabase
      .rpc("claim_next_job", { job_types: types });

    if (error) {
      throw new Error(`Failed to claim job: ${error.message}`);
    }

    if (!data || (Array.isArray(data) && data.length === 0)) return null;

    const row = Array.isArray(data) ? data[0] : data;
    return this.mapToJob(row);
  }

  async updateProgress(id: string, progress: number): Promise<void> {
    const clamped = Math.max(0, Math.min(100, Math.floor(progress)));
    await this.supabase
      .from("agent_jobs")
      .update({ progress: clamped })
      .eq("id", id);
  }

  async completeJob<TResult>(id: string, result: TResult): Promise<void> {
    await this.supabase
      .from("agent_jobs")
      .update({
        status: "completed",
        result,
        progress: 100,
        completed_at: new Date().toISOString()
      })
      .eq("id", id);
  }

  async failJob(id: string, error: Error, retryDelayMs: number = 30000): Promise<void> {
    // Fetch current retry count
    const { data: job } = await this.supabase
      .from("agent_jobs")
      .select("retry_count, max_retries")
      .eq("id", id)
      .single();

    if (!job) return;

    if (job.retry_count >= job.max_retries) {
      // Permanent failure
      await this.supabase
        .from("agent_jobs")
        .update({
          status: "failed",
          error: error.message || String(error),
          completed_at: new Date().toISOString()
        })
        .eq("id", id);
    } else {
      // Retry
      const nextRunAt = new Date(Date.now() + retryDelayMs).toISOString();
      await this.supabase
        .from("agent_jobs")
        .update({
          status: "pending", // Move back to queue
          retry_count: job.retry_count + 1,
          next_run_at: nextRunAt,
          error: error.message || String(error) // Track the last error
        })
        .eq("id", id);
    }
  }

  private mapToJob<TPayload, TResult>(row: any): Job<TPayload, TResult> {
    return {
      id: row.id,
      type: row.type,
      status: row.status as JobStatus,
      payload: row.payload as TPayload,
      result: row.result as TResult,
      error: row.error,
      progress: row.progress,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      nextRunAt: row.next_run_at
    };
  }
}
