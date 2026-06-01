import { describe, expect, it } from "vitest";
import { compileBetaNetwork } from "../beta-network.js";
import type { Fact } from "../fact-memory.js";
import type { FactPattern } from "../fact-pattern.js";

function makeFact(id: string, type: string, data: Record<string, unknown>): Fact {
	return { id, type, data };
}

describe("Inequality Join Constraints", () => {
	describe("pure inequality: $gt filters correctly", () => {
		it("produces only ordered pairs where b.tier > a.tier", () => {
			const patterns: FactPattern[] = [
				{ $fact: "Entry", $bind: "a" },
				{ $fact: "Entry", $bind: "b", $join: { tier: { $gt: "$a.tier" } } },
			];
			const network = compileBetaNetwork(patterns);

			const facts = [
				makeFact("f1", "Entry", { tier: 1 }),
				makeFact("f2", "Entry", { tier: 2 }),
				makeFact("f3", "Entry", { tier: 3 }),
			];

			for (const f of facts) {
				network.activate("a", f);
				network.activate("b", f);
			}

			const tokens = network.getCompleteTokens();
			// Pairs where b.tier > a.tier: (1,2), (1,3), (2,3) = 3
			expect(tokens).toHaveLength(3);
			for (const t of tokens) {
				expect(t.factBindings["b"].data.tier).toBeGreaterThan(t.factBindings["a"].data.tier as number);
			}
		});
	});

	describe("mixed equality + inequality", () => {
		it("stackKey equality and tier ordering", () => {
			const patterns: FactPattern[] = [
				{ $fact: "Entry", $bind: "a" },
				{ $fact: "Entry", $bind: "b", $join: { stackKey: "$a.stackKey", tier: { $gt: "$a.tier" } } },
			];
			const network = compileBetaNetwork(patterns);

			// Stack s1: tiers 1, 2
			const f1 = makeFact("f1", "Entry", { stackKey: "s1", tier: 1 });
			const f2 = makeFact("f2", "Entry", { stackKey: "s1", tier: 2 });
			// Stack s2: tier 3
			const f3 = makeFact("f3", "Entry", { stackKey: "s2", tier: 3 });

			for (const f of [f1, f2, f3]) {
				network.activate("a", f);
				network.activate("b", f);
			}

			const tokens = network.getCompleteTokens();
			// Only (s1-tier1, s1-tier2) matches: same stack AND b.tier > a.tier
			expect(tokens).toHaveLength(1);
			expect(tokens[0].factBindings["a"].data.tier).toBe(1);
			expect(tokens[0].factBindings["b"].data.tier).toBe(2);
		});
	});

	describe("5-entry stack with self-exclusion + inequality", () => {
		it("C(5,2) = 10 ordered pairs where b.tier > a.tier", () => {
			const patterns: FactPattern[] = [
				{ $fact: "Entry", $bind: "a" },
				{ $fact: "Entry", $bind: "b", $join: { stackKey: "$a.stackKey", tier: { $gt: "$a.tier" } } },
			];
			const network = compileBetaNetwork(patterns);

			const facts = Array.from({ length: 5 }, (_, i) => makeFact(`f${i}`, "Entry", { stackKey: "s1", tier: i + 1 }));

			for (const f of facts) {
				network.activate("a", f);
				network.activate("b", f);
			}

			const tokens = network.getCompleteTokens();
			expect(tokens).toHaveLength(10);
			for (const t of tokens) {
				expect(t.factBindings["b"].data.tier).toBeGreaterThan(t.factBindings["a"].data.tier as number);
				expect(t.factBindings["a"].id).not.toBe(t.factBindings["b"].id);
			}
		});
	});

	describe("multi-operator on same field", () => {
		it("$gte and $lte both must be satisfied (range check)", () => {
			const patterns: FactPattern[] = [
				{ $fact: "Entry", $bind: "a" },
				{ $fact: "Entry", $bind: "b", $join: { tier: { $gte: "$a.minTier", $lte: "$a.maxTier" } } },
			];
			const network = compileBetaNetwork(patterns);

			const range = makeFact("f0", "Entry", { tier: 0, minTier: 2, maxTier: 4 });
			const low = makeFact("f1", "Entry", { tier: 1, minTier: 0, maxTier: 10 });
			const mid = makeFact("f2", "Entry", { tier: 3, minTier: 0, maxTier: 10 });
			const high = makeFact("f3", "Entry", { tier: 5, minTier: 0, maxTier: 10 });

			for (const f of [range, low, mid, high]) {
				network.activate("a", f);
				network.activate("b", f);
			}

			const tokens = network.getCompleteTokens();
			// For "range" as a (min=2,max=4): b.tier in [2,4] → only mid(3) qualifies
			// For "low" as a (min=0,max=10): b.tier in [0,10] → range(0), mid(3), high(5) = 3
			// For "mid" as a (min=0,max=10): b.tier in [0,10] → range(0), low(1), high(5) = 3
			// For "high" as a (min=0,max=10): b.tier in [0,10] → range(0), low(1), mid(3) = 3
			// Total = 1 + 3 + 3 + 3 = 10
			expect(tokens).toHaveLength(10);
		});
	});

	describe("$ne operator", () => {
		it("excludes equal values", () => {
			const patterns: FactPattern[] = [
				{ $fact: "Entry", $bind: "a" },
				{ $fact: "Entry", $bind: "b", $join: { tier: { $ne: "$a.tier" } } },
			];
			const network = compileBetaNetwork(patterns);

			const facts = [
				makeFact("f1", "Entry", { tier: 1 }),
				makeFact("f2", "Entry", { tier: 1 }),
				makeFact("f3", "Entry", { tier: 2 }),
			];

			for (const f of facts) {
				network.activate("a", f);
				network.activate("b", f);
			}

			const tokens = network.getCompleteTokens();
			// 3 facts, self-exclusion → 6 ordered pairs
			// Same tier pairs: (f1,f2) and (f2,f1) excluded by $ne? No, $ne checks tier values not IDs
			// f1.tier=1, f2.tier=1 → b.tier != a.tier is false → excluded
			// Remaining: (f1,f3), (f3,f1), (f2,f3), (f3,f2) = 4
			expect(tokens).toHaveLength(4);
			for (const t of tokens) {
				expect(t.factBindings["a"].data.tier).not.toBe(t.factBindings["b"].data.tier);
			}
		});
	});

	describe("string comparison", () => {
		it("alphabetical ordering with $gt", () => {
			const patterns: FactPattern[] = [
				{ $fact: "Entry", $bind: "a" },
				{ $fact: "Entry", $bind: "b", $join: { name: { $gt: "$a.name" } } },
			];
			const network = compileBetaNetwork(patterns);

			const facts = [
				makeFact("f1", "Entry", { name: "alpha" }),
				makeFact("f2", "Entry", { name: "beta" }),
				makeFact("f3", "Entry", { name: "gamma" }),
			];

			for (const f of facts) {
				network.activate("a", f);
				network.activate("b", f);
			}

			const tokens = network.getCompleteTokens();
			// b.name > a.name: (alpha,beta), (alpha,gamma), (beta,gamma) = 3
			expect(tokens).toHaveLength(3);
			for (const t of tokens) {
				expect(t.factBindings["b"].data.name > (t.factBindings["a"].data.name as string)).toBe(true);
			}
		});
	});

	describe("backward compatibility", () => {
		it("string-only $join still works identically", () => {
			const patterns: FactPattern[] = [
				{ $fact: "Entry", $bind: "a" },
				{ $fact: "Entry", $bind: "b", $join: { stackKey: "$a.stackKey" } },
			];
			const network = compileBetaNetwork(patterns);

			const facts = [
				makeFact("f1", "Entry", { stackKey: "s1" }),
				makeFact("f2", "Entry", { stackKey: "s1" }),
				makeFact("f3", "Entry", { stackKey: "s2" }),
			];

			for (const f of facts) {
				network.activate("a", f);
				network.activate("b", f);
			}

			const tokens = network.getCompleteTokens();
			// s1: 2 facts → 2 ordered pairs (self-exclusion), s2: 1 fact → 0
			expect(tokens).toHaveLength(2);
			for (const t of tokens) {
				expect(t.factBindings["a"].data.stackKey).toBe(t.factBindings["b"].data.stackKey);
				expect(t.factBindings["a"].id).not.toBe(t.factBindings["b"].id);
			}
		});
	});
});
