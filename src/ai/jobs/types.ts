/**
 * KoshurKart — Agent Jobs Framework Types
 * =================================================================
 * Defines the core types and interfaces for the provider-agnostic background
 * jobs framework. This allows long-running or delayed agent tasks to be 
 * executed out-of-band without holding client connections open.
 */

export type JobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/** Core Job entity as returned from the JobStore */
export interface Job<TPayload = unknown, TResult = unknown> {
  id: string;
  type: string;
  status: JobStatus;
  payload: TPayload;
  result?: TResult;
  error?: string;
  progress: number;
  retryCount: number;
  maxRetries: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  nextRunAt: string;
}

export interface EnqueueOptions {
  /** Optional delay before the job can be executed */
  delayMs?: number;
  /** Maximum number of retry attempts upon failure (default 3) */
  maxRetries?: number;
}

/** 
 * Abstraction for the underlying database/storage of jobs.
 * This is the DI seam allowing us to use Supabase, Redis, or InMemory.
 */
export interface JobStore {
  /** Create a new job in the store */
  enqueue<TPayload>(type: string, payload: TPayload, options?: EnqueueOptions): Promise<string>;
  
  /** Retrieve a job's status and details */
  getJob<TPayload, TResult>(id: string): Promise<Job<TPayload, TResult> | null>;
  
  /** Mark a job as cancelled, preventing future runs */
  cancelJob(id: string): Promise<void>;
  
  /** Atomically find and claim the next pending job of the given types */
  claimNextJob(types: string[]): Promise<Job | null>;
  
  /** Update progress (0-100) */
  updateProgress(id: string, progress: number): Promise<void>;
  
  /** Mark a job as completed with a successful result */
  completeJob<TResult>(id: string, result: TResult): Promise<void>;
  
  /** Mark a job as failed, potentially scheduling it for retry */
  failJob(id: string, error: Error, retryDelayMs?: number): Promise<void>;
}

/**
 * Interface for executing a specific type of job.
 */
export interface JobExecutor<TPayload = unknown, TResult = unknown> {
  readonly type: string;
  /**
   * Execute the job logic. 
   * @param job The claimed job entity.
   * @param updateProgress A callback to report progress (0-100) to the store.
   * @param signal An AbortSignal to detect cancellation.
   */
  execute(
    job: Job<TPayload, TResult>, 
    updateProgress: (progress: number) => Promise<void>,
    signal: AbortSignal
  ): Promise<TResult>;
}
