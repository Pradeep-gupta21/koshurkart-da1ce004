/**
 * KoshurKart — AgentRegistry
 * =================================================================
 * An in-memory catalog of the agents available to a host application, keyed
 * by their unique `id`. It mirrors `ToolRegistry` in spirit: the single place
 * that knows *which* agents exist and how to look one up — by id or by the
 * `ChatAudience` it serves — so a router/UI never hard-codes construction.
 *
 * It holds no state beyond the agent map — no data sources, no network, no
 * keys. Agents themselves are provider-agnostic; this just organizes them.
 */

import type { ChatAudience } from "@/ai/types/chat";
import type { Agent } from "./types";

/** An `Agent` with its service generic erased, for heterogeneous storage. */
type AnyAgent = Agent<Record<string, unknown>>;

export class AgentRegistry {
  /** id → agent. Ids are unique; registering a dup is rejected. */
  private readonly agents = new Map<string, AnyAgent>();

  /**
   * Seed a registry from an initial list. Convenience over calling
   * `register` repeatedly at construction sites.
   */
  constructor(initial: readonly Agent<never>[] = []) {
    this.registerMany(initial);
  }

  /* -------------------------------------------------------------- *
   * Mutation
   * -------------------------------------------------------------- */

  /**
   * Register a single agent. Throws if an agent with the same id is already
   * registered — ids are the addressing scheme and must be unique. Pass
   * `{ override: true }` to replace an existing entry deliberately.
   */
  register<TServices extends Record<string, unknown>>(
    agent: Agent<TServices>,
    options: { override?: boolean } = {},
  ): this {
    const existing = this.agents.has(agent.id);
    if (existing && !options.override) {
      throw new Error(
        `AgentRegistry: an agent with id "${agent.id}" is already registered.`,
      );
    }
    this.agents.set(agent.id, agent as unknown as AnyAgent);
    return this;
  }

  /** Register several agents at once. Fails fast on the first duplicate id. */
  registerMany(agents: readonly Agent<never>[]): this {
    for (const agent of agents) this.register(agent);
    return this;
  }

  /** Remove an agent by id. Returns true if one was actually removed. */
  unregister(id: string): boolean {
    return this.agents.delete(id);
  }

  /** Remove every agent. Primarily useful in tests. */
  clear(): void {
    this.agents.clear();
  }

  /* -------------------------------------------------------------- *
   * Lookup
   * -------------------------------------------------------------- */

  /** Whether an agent with the given id is registered. */
  has(id: string): boolean {
    return this.agents.has(id);
  }

  /**
   * Fetch an agent by id, or `undefined` if absent. Returned as the erased
   * `Agent` type because the registry is heterogeneous; callers that know the
   * concrete service shape can cast at the boundary.
   */
  get(id: string): AnyAgent | undefined {
    return this.agents.get(id);
  }

  /**
   * The first registered agent serving the given audience, or `undefined`.
   * Useful for routing a turn to "the customer agent" without knowing its id.
   */
  getByAudience(audience: ChatAudience): AnyAgent | undefined {
    for (const agent of this.agents.values()) {
      if (agent.audience === audience) return agent;
    }
    return undefined;
  }

  /** All agents serving the given audience, insertion-ordered. */
  filterByAudience(audience: ChatAudience): AnyAgent[] {
    return this.list().filter((agent) => agent.audience === audience);
  }

  /** Number of registered agents. */
  get size(): number {
    return this.agents.size;
  }

  /** All registered agents, insertion-ordered. */
  list(): AnyAgent[] {
    return [...this.agents.values()];
  }

  /** The ids of all registered agents, insertion-ordered. */
  ids(): string[] {
    return [...this.agents.keys()];
  }
}
