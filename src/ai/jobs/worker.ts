import type { JobExecutor, JobStore } from "./types";

export interface JobWorkerOptions {
  /** Injected store to claim and update jobs */
  store: JobStore;
  /** List of job executors this worker can handle */
  executors: JobExecutor<any, any>[];
  /** Optional logger */
  logger?: JobLogger;
  /** Default retry delay in ms (default 30000 = 30s) */
  defaultRetryDelayMs?: number;
}

export interface JobLogger {
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
}

export class JobWorker {
  private readonly store: JobStore;
  private readonly executors: Map<string, JobExecutor<any, any>>;
  private readonly logger?: JobLogger;
  private readonly defaultRetryDelayMs: number;

  constructor(options: JobWorkerOptions) {
    this.store = options.store;
    this.logger = options.logger;
    this.defaultRetryDelayMs = options.defaultRetryDelayMs ?? 30000;
    
    this.executors = new Map();
    for (const executor of options.executors) {
      this.executors.set(executor.type, executor);
    }
  }

  /**
   * Fetch and process the next available job for the registered executors.
   * Resolves to true if a job was processed, false if the queue was empty.
   */
  async processNext(signal?: AbortSignal): Promise<boolean> {
    if (signal?.aborted) return false;

    const types = Array.from(this.executors.keys());
    if (types.length === 0) return false;

    // 1. Claim a job
    const job = await this.store.claimNextJob(types);
    if (!job) return false; // Queue empty

    const executor = this.executors.get(job.type);
    if (!executor) {
      // Should never happen due to the claimNextJob(types) filter, but handle just in case
      await this.store.failJob(job.id, new Error(`No executor registered for type ${job.type}`));
      return true;
    }

    this.logger?.info(`Processing job ${job.id} (type: ${job.type})`);

    // 2. Setup progress callback and abort signal
    const abortController = new AbortController();
    const abortListener = () => abortController.abort();
    if (signal) {
      signal.addEventListener("abort", abortListener);
    }

    const updateProgress = async (progress: number) => {
      // Don't await strictly to prevent slowing down the executor
      this.store.updateProgress(job.id, progress).catch(err => {
        this.logger?.warn(`Failed to update progress for job ${job.id}: ${err}`);
      });
    };

    // 3. Execute
    try {
      const result = await executor.execute(job, updateProgress, abortController.signal);
      
      if (abortController.signal.aborted) {
        throw new Error("Job execution aborted");
      }

      await this.store.completeJob(job.id, result);
      this.logger?.info(`Job ${job.id} completed successfully`);
    } catch (error: any) {
      this.logger?.error(`Job ${job.id} failed`, error);
      await this.store.failJob(job.id, error, this.defaultRetryDelayMs);
    } finally {
      if (signal) {
        signal.removeEventListener("abort", abortListener);
      }
    }

    return true;
  }

  /**
   * Processes all pending jobs continuously until the queue is empty.
   */
  async processQueue(signal?: AbortSignal): Promise<void> {
    let processed = true;
    while (processed && !signal?.aborted) {
      processed = await this.processNext(signal);
    }
  }
}
