/**
 * KoshurKart — AI tools barrel
 * =================================================================
 * Clean public surface for the tool framework. Import from here rather
 * than reaching into individual files:
 *
 *   import {
 *     BaseTool,
 *     ToolRegistry,
 *     ToolExecutor,
 *     ok,
 *     err,
 *   } from "@/ai/tools";
 *   import type { Tool, ToolContext, ToolResult } from "@/ai/tools";
 *
 * This module ships only the *reusable architecture* — the `Tool`
 * contract, a `BaseTool` to build on, a `ToolRegistry` to catalog tools,
 * and a `ToolExecutor` to run them. No concrete, marketplace-specific
 * tools live here yet, and nothing in this folder touches the network,
 * holds API keys, or renders UI. Future planners and agents compose these
 * pieces: register tools, then execute them through the executor.
 */

/* ---- Types & result helpers ------------------------------------- */
export type {
  Tool,
  AnyTool,
  ToolContext,
  ToolLogger,
  ToolResult,
  ToolError,
  ToolErrorCode,
  ToolExecutionOptions,
} from "./types";
export { ok, err, isOk } from "./types";

/* ---- Base class for building tools ------------------------------ */
export { BaseTool } from "./base.tool";

/* ---- Catalog ---------------------------------------------------- */
export { ToolRegistry } from "./registry";

/* ---- Runner ----------------------------------------------------- */
export { ToolExecutor } from "./executor";
export type { ToolContextSource } from "./executor";

/* ---- Re-exported protocol shapes -------------------------------- *
 * Convenience so consumers can type tool declarations and calls without a
 * second import from the chat types. These originate in src/ai/types/chat.ts.
 */
export type {
  ToolDefinition,
  ToolCall,
  JSONSchema,
} from "@/ai/types/chat";

/* ---- Commerce Tools Architecture -------------------------------- *
 * Shared types, interfaces, and base tools for Commerce operations.
 */
export * from "./commerce";

