/**
 * KoshurKart — Planner dependency-graph utilities
 * =================================================================
 * Pure, provider-agnostic directed-graph algorithms used by the planning
 * layer to reason about step dependencies *before* a plan executes. The
 * headline capability is **DAG cycle detection**: given a set of nodes that
 * depend on one another, decide whether the dependency graph is acyclic and,
 * if it is not, report the exact cycles that make it unsafe to execute.
 *
 * The module is intentionally decoupled from the planner's own types. It
 * speaks only in terms of `{ id, dependsOn }` nodes, so the same detector can
 * be reused by plan validation, by execution ordering, or by any future
 * component that holds a dependency graph — without importing plan/goal
 * shapes or touching the network, a registry, or the AI service.
 *
 * Algorithm: cycle detection runs Kahn's topological sort. Every node whose
 * in-degree can be driven to zero by iteratively removing dependency-free
 * nodes belongs to a DAG; any node that survives the sweep is part of a
 * cycle. A follow-up depth-first search over only the surviving subgraph
 * traces the precise loops so callers can produce actionable errors
 * ("a → b → c → a"). Both passes are deterministic: nodes are processed in
 * input order and duplicate cycles are collapsed to a single canonical form.
 */

/**
 * A single node in a dependency graph. `dependsOn` lists the ids of nodes
 * that must come *before* this one (edge direction: node → dependency).
 * References to ids not present in the node set are ignored — resolving
 * unknown dependencies is a separate concern from detecting cycles.
 */
export interface DependencyNode {
  /** Stable id, unique within the graph. */
  readonly id: string;
  /** Ids this node depends on. Empty/omitted means no prerequisites. */
  readonly dependsOn?: readonly string[];
}

/** The outcome of inspecting a dependency graph for cycles. */
export interface CycleDetectionResult {
  /** True when the graph is a valid DAG (contains no cycles). */
  readonly acyclic: boolean;
  /**
   * Every distinct cycle found, each expressed as a closed path whose first
   * and last ids are identical, e.g. `["a", "b", "c", "a"]`. Empty when the
   * graph is acyclic. Cycles are de-duplicated: a loop discovered from
   * different entry points is reported once.
   */
  readonly cycles: readonly string[][];
}

/** Internal adjacency representation built once and shared by both passes. */
interface Graph {
  /** Insertion-ordered set of every known node id. */
  readonly ids: Set<string>;
  /** id → list of ids it depends on (edges to known nodes only). */
  readonly adjacency: Map<string, string[]>;
  /** id → number of nodes that depend on it (incoming edges). */
  readonly inDegree: Map<string, number>;
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Detect dependency cycles in a directed graph.
 *
 * Returns `{ acyclic: true, cycles: [] }` for a DAG, or
 * `{ acyclic: false, cycles }` with the exact loops otherwise. Pure and
 * deterministic — the same input always yields the same result, and the same
 * cycles in the same order.
 *
 * Self-dependencies (a node listing its own id) are reported as one-node
 * loops (`["a", "a"]`); callers that treat self-dependencies specially can
 * still surface them here as cycles.
 */
export function detectCycles(
  nodes: readonly DependencyNode[],
): CycleDetectionResult {
  const graph = buildGraph(nodes);

  // Kahn's algorithm yields every node reachable by repeatedly removing
  // dependency-free nodes. If all nodes are removed, the graph is acyclic.
  const sorted = kahnOrder(graph);
  if (sorted.length === graph.ids.size) {
    return { acyclic: true, cycles: [] };
  }

  // The survivors are exactly the nodes participating in (or feeding) a
  // cycle. Trace the precise loops among them via DFS.
  const sortedSet = new Set(sorted);
  const remaining = new Set<string>();
  for (const id of graph.ids) {
    if (!sortedSet.has(id)) remaining.add(id);
  }

  return { acyclic: false, cycles: traceCycles(graph.adjacency, remaining) };
}

/**
 * True when the graph is acyclic. Thin convenience wrapper over
 * {@link detectCycles} for call sites that only need the boolean.
 */
export function isAcyclic(nodes: readonly DependencyNode[]): boolean {
  return detectCycles(nodes).acyclic;
}

/* ------------------------------------------------------------------ *
 * Internals
 * ------------------------------------------------------------------ */

/**
 * Build the adjacency list and in-degree map. Only edges to *known* nodes are
 * recorded; a `dependsOn` pointing at a missing id is skipped so that unknown
 * dependencies never masquerade as cycles.
 */
function buildGraph(nodes: readonly DependencyNode[]): Graph {
  const ids = new Set<string>();
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    if (ids.has(node.id)) continue;
    ids.add(node.id);
    adjacency.set(node.id, []);
    inDegree.set(node.id, 0);
  }

  for (const node of nodes) {
    const from = adjacency.get(node.id);
    if (!from) continue; // Only possible for a falsy/empty id; nothing to link.
    for (const dep of node.dependsOn ?? []) {
      if (!ids.has(dep)) continue; // Unknown dependency — not our concern here.
      from.push(dep);
      inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
    }
  }

  return { ids, adjacency, inDegree };
}

/**
 * Kahn's topological sort. Returns the ids that could be ordered; a length
 * shorter than the node count means the leftover nodes form one or more
 * cycles. Processes ready nodes in input order for deterministic output.
 */
function kahnOrder(graph: Graph): string[] {
  const inDegree = new Map(graph.inDegree);
  const queue: string[] = [];

  // Seed with dependency-free nodes, preserving input order.
  for (const id of graph.ids) {
    if ((inDegree.get(id) ?? 0) === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift() as string;
    order.push(node);
    for (const dep of graph.adjacency.get(node) ?? []) {
      const next = (inDegree.get(dep) ?? 1) - 1;
      inDegree.set(dep, next);
      if (next === 0) queue.push(dep);
    }
  }

  return order;
}

/**
 * Depth-first search over the cyclic subgraph, extracting each distinct loop.
 * Only nodes in `remaining` are traversed, so the search stays within the
 * part of the graph Kahn's algorithm could not resolve.
 */
function traceCycles(
  adjacency: Map<string, string[]>,
  remaining: Set<string>,
): string[][] {
  const visited = new Set<string>();
  const reported = new Set<string>();
  const cycles: string[][] = [];

  for (const start of remaining) {
    if (visited.has(start)) continue;

    const path: string[] = [];
    const onPath = new Set<string>();

    const dfs = (nodeId: string): void => {
      if (onPath.has(nodeId)) {
        // Close the loop from the first occurrence of this node on the path.
        const cycleStart = path.indexOf(nodeId);
        const cycle = [...path.slice(cycleStart), nodeId];
        const key = canonicalKey(cycle);
        if (!reported.has(key)) {
          reported.add(key);
          cycles.push(cycle);
        }
        return;
      }

      if (visited.has(nodeId)) return;

      path.push(nodeId);
      onPath.add(nodeId);

      for (const dep of adjacency.get(nodeId) ?? []) {
        if (remaining.has(dep)) dfs(dep);
      }

      onPath.delete(nodeId);
      path.pop();
      visited.add(nodeId);
    };

    dfs(start);
  }

  return cycles;
}

/**
 * Canonical string key for a cycle, independent of the entry point it was
 * discovered from. Rotates the loop to start at its lexicographically
 * smallest node so `a → b → a` and `b → a → b` collapse to one report.
 */
function canonicalKey(cycle: readonly string[]): string {
  const body = cycle.slice(0, -1); // Drop the repeated closing node.
  const min = body.reduce((a, b) => (a < b ? a : b));
  const minIdx = body.indexOf(min);
  const rotated = [...body.slice(minIdx), ...body.slice(0, minIdx)];
  return [...rotated, rotated[0]].join("→");
}
