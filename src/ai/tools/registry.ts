/**
 * KoshurKart — ToolRegistry
 * =================================================================
 * An in-memory catalog of the tools available to planners and agents.
 * The registry is the single place that knows *which* tools exist; the
 * `ToolExecutor` (see src/ai/tools/executor.ts) is what actually runs one.
 *
 * Responsibilities:
 *  - Register / unregister tools by their unique `name`.
 *  - Look a tool up, or list the set (optionally scoped to an audience).
 *  - Produce provider-facing `ToolDefinition[]` to advertise to a model.
 *
 * It holds no state beyond the tool map — no data sources, no network, no
 * keys. Tools themselves are provider-agnostic; this just organizes them.
 */

import type { ChatAudience, ToolDefinition } from "@/ai/types/chat";
import type { AnyTool, Tool } from "./types";

export class ToolRegistry {
  /** Name → tool. Names are unique; registering a dup is rejected. */
  private readonly tools = new Map<string, AnyTool>();

  /**
   * Seed a registry from an initial list. Convenience over calling
   * `register` repeatedly at construction sites.
   */
  constructor(initial: readonly AnyTool[] = []) {
    this.registerMany(initial);
  }

  /* -------------------------------------------------------------- *
   * Mutation
   * -------------------------------------------------------------- */

  /**
   * Register a single tool. Throws if a tool with the same name is already
   * registered — names are the model's addressing scheme and must be unique.
   * Pass `{ override: true }` to replace an existing entry deliberately.
   */
  register<TInput, TOutput, TServices extends Record<string, unknown>>(
    tool: Tool<TInput, TOutput, TServices>,
    options: { override?: boolean } = {},
  ): this {
    const existing = this.tools.has(tool.name);
    if (existing && !options.override) {
      throw new Error(
        `ToolRegistry: a tool named "${tool.name}" is already registered.`,
      );
    }
    this.tools.set(tool.name, tool as unknown as AnyTool);
    return this;
  }

  /** Register several tools at once. Fails fast on the first duplicate. */
  registerMany(tools: readonly AnyTool[]): this {
    for (const tool of tools) this.register(tool);
    return this;
  }

  /** Remove a tool by name. Returns true if one was actually removed. */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /** Remove every tool. Primarily useful in tests. */
  clear(): void {
    this.tools.clear();
  }

  /* -------------------------------------------------------------- *
   * Lookup
   * -------------------------------------------------------------- */

  /** Whether a tool with the given name is registered. */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Fetch a tool by name, or `undefined` if absent. Returned as `AnyTool`
   * because the registry is heterogeneous; callers that know the concrete
   * type can cast at the boundary.
   */
  get(name: string): AnyTool | undefined {
    return this.tools.get(name);
  }

  /** Number of registered tools. */
  get size(): number {
    return this.tools.size;
  }

  /** All registered tools, insertion-ordered. */
  list(): AnyTool[] {
    return [...this.tools.values()];
  }

  /** The names of all registered tools, insertion-ordered. */
  names(): string[] {
    return [...this.tools.keys()];
  }

  /**
   * Tools visible to a given audience: those with no audience restriction
   * plus those explicitly listing this audience. This is a *visibility*
   * filter; the executor still enforces the same rule at call time.
   */
  filterByAudience(audience: ChatAudience): AnyTool[] {
    return this.list().filter(
      (tool) => !tool.audiences || tool.audiences.includes(audience),
    );
  }

  /* -------------------------------------------------------------- *
   * Provider surface
   * -------------------------------------------------------------- */

  /**
   * Provider-facing declarations for the model. Pass an `audience` to only
   * advertise the tools that audience is allowed to use.
   */
  toDefinitions(audience?: ChatAudience): ToolDefinition[] {
    const tools = audience ? this.filterByAudience(audience) : this.list();
    return tools.map((tool) => tool.toDefinition());
  }
}
