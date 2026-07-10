/**
 * KoshurKart — Frontend AI client barrel
 * =================================================================
 * The public surface of the frontend AI networking layer. Import from here
 * rather than reaching into individual files:
 *
 *   import { AIClient, defaultAIClient } from "@/lib/ai";
 *   import type { AgentMessage, AgentChatPayload, AIChatTransport } from "@/lib/ai";
 *
 * Layering (bottom → top), each independently testable and presentation-free:
 *   transport  →  sse  →  client            (this module)
 *   client     →  useAgent hook             (src/hooks/useAgent.ts)
 *   hook       →  UI components             (future — not built here)
 */

/* ---- Types (built on the backend wire contract) ------------------ */
export type {
  AgentMessage,
  AgentMessageStatus,
  AgentChatPayload,
  AgentStreamEvent,
  AIStreamEvent,
  AIError,
  AIErrorCode,
  ChatAudience,
  ChatMessage,
  ChatRole,
  FinishReason,
  TokenUsage,
  ToolCall,
} from "./types";

/* ---- Transport seam --------------------------------------------- */
export { AITransportError } from "./transport";
export type { AIChatTransport } from "./transport";
export {
  createSupabaseAIChatTransport,
} from "./supabaseTransport";
export type { SupabaseAIChatTransportConfig } from "./supabaseTransport";

/* ---- SSE parsing ------------------------------------------------- */
export { parseSSEStream, SSE_DONE } from "./sse";

/* ---- Client ------------------------------------------------------ */
export { AIClient, defaultAIClient } from "./client";
export type { AIClientConfig } from "./client";
