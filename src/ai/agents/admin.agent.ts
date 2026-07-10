/**
 * KoshurKart — AdminAgent
 * =================================================================
 * The administrator-facing agent. Like every concrete agent it is a thin
 * binding over `BaseAgent`: it fixes the `audience` to `"admin"` and supplies
 * stable id/label defaults. Reasoning, tools, planning, and memory all arrive
 * through the injected dependencies; the admin system prompt is resolved by
 * the injected `AIService` (or overridden via `config.systemPrompt`).
 *
 * No marketplace business logic lives here — what makes it "the admin
 * assistant" is the wiring the caller supplies via `AgentDependencies`.
 */

import type { ChatAudience } from "@/ai/types/chat";
import { BaseAgent } from "./base.agent";
import type { AgentConfig } from "./types";

export class AdminAgent<
  TServices extends Record<string, unknown> = Record<string, unknown>,
> extends BaseAgent<TServices> {
  protected readonly defaultId = "admin";
  protected readonly defaultLabel = "Admin Assistant";
  readonly audience: ChatAudience = "admin";

  constructor(config: AgentConfig<TServices>) {
    super(config);
  }
}

/**
 * Convenience factory mirroring the providers/tools/planner/memory module
 * style, so a caller can spin up an agent without `new`.
 */
export function createAdminAgent<
  TServices extends Record<string, unknown> = Record<string, unknown>,
>(config: AgentConfig<TServices>): AdminAgent<TServices> {
  return new AdminAgent<TServices>(config);
}
