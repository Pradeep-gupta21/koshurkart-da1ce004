/**
 * KoshurKart — Agent Framework barrel
 * =================================================================
 * Clean public surface for the agent layer. Import from here rather than
 * reaching into individual files:
 *
 *   import {
 *     CustomerAgent,
 *     VendorAgent,
 *     AdminAgent,
 *     AgentRegistry,
 *     createCustomerAgent,
 *   } from "@/ai/agents";
 *   import type { Agent, AgentConfig, AgentResult } from "@/ai/agents";
 *
 * The Agent Framework is the *top orchestration layer* that binds the AI
 * module's other seams together: `AIService` (reasoning), the planner (goal
 * decomposition), the tool registry + executor (action), and memory (recall).
 * An `Agent` recalls context, composes a request, generates a reply, runs any
 * tool calls, persists the exchange, and can delegate multi-step objectives
 * to a planner.
 *
 * This module ships only the *reusable architecture* — the `Agent` contract,
 * a `BaseAgent` to build on, the three audience-bound agents, and an
 * `AgentRegistry`. It is provider-agnostic and free of marketplace logic:
 * nothing here touches the network, holds API keys, renders UI, or reaches a
 * database. Every integration point is injected via `AgentDependencies`.
 */

/* ---- Core types & result helpers -------------------------------- */
export type {
  Agent,
  AgentCapabilities,
  AgentConfig,
  AgentDependencies,
  AgentError,
  AgentErrorCode,
  AgentInput,
  AgentInvocation,
  AgentMemory,
  AgentResponse,
  AgentResult,
  AgentToolInvocation,
} from "./types";
export { agentOk, agentErr, isAgentOk } from "./types";

/* ---- Base class ------------------------------------------------- */
export { BaseAgent } from "./base.agent";

/* ---- Audience-bound agents -------------------------------------- */
export { CustomerAgent, createCustomerAgent } from "./customer.agent";
export { VendorAgent, createVendorAgent } from "./vendor.agent";
export { AdminAgent, createAdminAgent } from "./admin.agent";

/* ---- Catalog ---------------------------------------------------- */
export { AgentRegistry } from "./registry";
