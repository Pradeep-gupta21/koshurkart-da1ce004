/**
 * Unit tests for the reusable planner dependency-graph utilities.
 *
 * These exercise `detectCycles` directly — the deterministic Kahn's-algorithm
 * + DFS engine that backs plan validation's cycle rejection — across valid
 * DAGs, simple and long cycles, self-loops, disconnected components, multiple
 * independent cycles, and unknown/duplicate dependency edge cases.
 */

import { describe, it, expect } from "vitest";
import { detectCycles, isAcyclic, type DependencyNode } from "../graph";

/** Terse helper to build a node. */
const node = (id: string, ...dependsOn: string[]): DependencyNode => ({
  id,
  dependsOn,
});

describe("detectCycles", () => {
  describe("acyclic graphs", () => {
    it("treats an empty graph as acyclic", () => {
      const result = detectCycles([]);
      expect(result.acyclic).toBe(true);
      expect(result.cycles).toEqual([]);
    });

    it("treats a single node with no deps as acyclic", () => {
      expect(detectCycles([node("a")]).acyclic).toBe(true);
    });

    it("accepts a linear chain a → b → c", () => {
      const result = detectCycles([node("a", "b"), node("b", "c"), node("c")]);
      expect(result.acyclic).toBe(true);
      expect(result.cycles).toHaveLength(0);
    });

    it("accepts a diamond (shared dependency, no cycle)", () => {
      // a → b, a → c, b → d, c → d
      const result = detectCycles([
        node("a", "b", "c"),
        node("b", "d"),
        node("c", "d"),
        node("d"),
      ]);
      expect(result.acyclic).toBe(true);
    });

    it("accepts a wide fan-in/fan-out DAG", () => {
      const result = detectCycles([
        node("root"),
        node("l1", "root"),
        node("l2", "root"),
        node("l3", "root"),
        node("sink", "l1", "l2", "l3"),
      ]);
      expect(result.acyclic).toBe(true);
    });
  });

  describe("cyclic graphs", () => {
    it("detects a two-node cycle a ⇄ b", () => {
      const result = detectCycles([node("a", "b"), node("b", "a")]);
      expect(result.acyclic).toBe(false);
      expect(result.cycles).toHaveLength(1);
      const cycle = result.cycles[0];
      // Closed loop: first and last id match.
      expect(cycle[0]).toBe(cycle[cycle.length - 1]);
      expect(new Set(cycle)).toEqual(new Set(["a", "b"]));
    });

    it("detects a three-node cycle a → b → c → a", () => {
      const result = detectCycles([
        node("a", "b"),
        node("b", "c"),
        node("c", "a"),
      ]);
      expect(result.acyclic).toBe(false);
      expect(result.cycles).toHaveLength(1);
      expect(new Set(result.cycles[0])).toEqual(new Set(["a", "b", "c"]));
    });

    it("detects a self-dependency as a one-node loop", () => {
      const result = detectCycles([node("a", "a")]);
      expect(result.acyclic).toBe(false);
      expect(result.cycles).toEqual([["a", "a"]]);
    });

    it("flags a cycle even when reachable only through acyclic prefix", () => {
      // start → a → b → c → a  (b/c/a form a cycle; start is a clean entry)
      const result = detectCycles([
        node("start", "a"),
        node("a", "b"),
        node("b", "c"),
        node("c", "a"),
      ]);
      expect(result.acyclic).toBe(false);
      expect(result.cycles).toHaveLength(1);
      expect(new Set(result.cycles[0])).toEqual(new Set(["a", "b", "c"]));
    });

    it("reports two independent cycles separately", () => {
      const result = detectCycles([
        node("a", "b"),
        node("b", "a"),
        node("x", "y"),
        node("y", "x"),
      ]);
      expect(result.acyclic).toBe(false);
      expect(result.cycles).toHaveLength(2);
      const sets = result.cycles.map((c) => new Set(c));
      expect(sets).toContainEqual(new Set(["a", "b"]));
      expect(sets).toContainEqual(new Set(["x", "y"]));
    });

    it("de-duplicates a cycle discovered from multiple entry points", () => {
      // Every node feeds into the same 3-cycle; it must be reported once.
      const result = detectCycles([
        node("a", "b"),
        node("b", "c"),
        node("c", "a"),
        node("d", "a"),
        node("e", "b"),
      ]);
      expect(result.cycles).toHaveLength(1);
    });
  });

  describe("edge cases", () => {
    it("ignores dependencies on unknown nodes (not a cycle)", () => {
      const result = detectCycles([node("a", "missing"), node("b", "a")]);
      expect(result.acyclic).toBe(true);
    });

    it("does not treat repeated identical edges as a cycle", () => {
      const result = detectCycles([node("a", "b", "b"), node("b")]);
      expect(result.acyclic).toBe(true);
    });

    it("is deterministic across repeated runs", () => {
      const nodes = [node("a", "b"), node("b", "c"), node("c", "a")];
      const first = JSON.stringify(detectCycles(nodes));
      const second = JSON.stringify(detectCycles(nodes));
      expect(first).toBe(second);
    });
  });

  describe("isAcyclic", () => {
    it("returns true for a DAG and false for a cycle", () => {
      expect(isAcyclic([node("a", "b"), node("b")])).toBe(true);
      expect(isAcyclic([node("a", "b"), node("b", "a")])).toBe(false);
    });
  });
});
