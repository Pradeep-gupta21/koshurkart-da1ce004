/**
 * KoshurKart — VendorAgent
 * =================================================================
 * The vendor-facing agent. Like every concrete agent it is a thin binding
 * over `BaseAgent`: it fixes the `audience` to `"vendor"` and supplies stable
 * id/label defaults. Reasoning, tools, planning, and memory all arrive
 * through the injected dependencies; the vendor system prompt is resolved by
 * the injected `AIService` (or overridden via `config.systemPrompt`).
 *
 * No marketplace business logic lives here — what makes it "the vendor
 * assistant" is the wiring the caller supplies via `AgentDependencies`.
 */

import type { ChatAudience } from "@/ai/types/chat";
import { BaseAgent } from "./base.agent";
import type { AgentConfig } from "./types";

export class VendorAgent<
  TServices extends Record<string, unknown> = Record<string, unknown>,
> extends BaseAgent<TServices> {
  protected readonly defaultId = "vendor";
  protected readonly defaultLabel = "Vendor Assistant";
  readonly audience: ChatAudience = "vendor";

  constructor(config: AgentConfig<TServices>) {
    super(config);
  }
}

/**
 * Convenience factory mirroring the providers/tools/planner/memory module
 * style, so a caller can spin up an agent without `new`.
 */
export function createVendorAgent<
  TServices extends Record<string, unknown> = Record<string, unknown>,
>(config: AgentConfig<TServices>): VendorAgent<TServices> {
  return new VendorAgent<TServices>(config);
}
