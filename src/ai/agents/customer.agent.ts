/**
 * KoshurKart — CustomerAgent
 * =================================================================
 * The customer-facing agent. It is a thin binding over `BaseAgent`: it fixes
 * the `audience` to `"customer"` and supplies stable id/label defaults. All
 * behavior — reasoning, tools, planning, memory — comes from the injected
 * dependencies, and the audience-scoped system prompt is resolved by the
 * injected `AIService` (or overridden via `config.systemPrompt`).
 *
 * There is deliberately NO marketplace business logic here. The prompt,
 * tools, and knowledge that make it "the customer assistant" are wired in by
 * the caller through `AgentDependencies`, keeping this class reusable and
 * provider-agnostic.
 */

import type { ChatAudience } from "@/ai/types/chat";
import { BaseAgent } from "./base.agent";
import type { AgentConfig } from "./types";

export class CustomerAgent<
  TServices extends Record<string, unknown> = Record<string, unknown>,
> extends BaseAgent<TServices> {
  protected readonly defaultId = "customer";
  protected readonly defaultLabel = "Customer Assistant";
  readonly audience: ChatAudience = "customer";

  constructor(config: AgentConfig<TServices>) {
    super(config);
  }
}

/**
 * Convenience factory mirroring the providers/tools/planner/memory module
 * style, so a caller can spin up an agent without `new`.
 */
export function createCustomerAgent<
  TServices extends Record<string, unknown> = Record<string, unknown>,
>(config: AgentConfig<TServices>): CustomerAgent<TServices> {
  return new CustomerAgent<TServices>(config);
}
