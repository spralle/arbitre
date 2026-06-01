import { describe, expect, it } from "vitest";
import { compileBetaNetwork } from "../beta-network.js";
import type { Fact } from "../fact-memory.js";
import type { FactPattern } from "../fact-pattern.js";

function makeFact(id: string, type: string, data: Record<string, unknown>): Fact {
	return { id, type, data };
}

describe("self-exclusion guard", () => {
	describe("2-fact self-join", () => {
		it("produces 2 tokens (a->b, b->a), not 4", () => {
			const patterns: FactPattern[] = [
				{ $fact: "Entry", $bind: "e1", $join: { stackKey: "$e2.stackKey" } },
				{ $fact: "Entry", $bind: "e2", $join: { stackKey: "$e1.stackKey" } },
			];
			const network = compileBetaNetwork(patterns);

			const a = makeFact("f1", "Entry", { stackKey: "s1" });
			const b = makeFact("f2", "Entry", { stackKey: "s1" });

			network.activate("e1", a);
			network.activate("e1", b);
			network.activate("e2", a);
			network.activate("e2", b);

			const tokens = network.getCompleteTokens();
			expect(tokens).toHaveLength(2);
			// Verify no token has the same fact in both bindings
			for (const t of tokens) {
				expect(t.factBindings["e1"].id).not.toBe(t.factBindings["e2"].id);
			}
		});
	});

	describe("3-fact self-join", () => {
		it("produces 6 tokens, not 9", () => {
			const patterns: FactPattern[] = [
				{ $fact: "Entry", $bind: "e1", $join: { stackKey: "$e2.stackKey" } },
				{ $fact: "Entry", $bind: "e2", $join: { stackKey: "$e1.stackKey" } },
			];
			const network = compileBetaNetwork(patterns);

			const facts = [
				makeFact("f1", "Entry", { stackKey: "s1" }),
				makeFact("f2", "Entry", { stackKey: "s1" }),
				makeFact("f3", "Entry", { stackKey: "s1" }),
			];

			for (const f of facts) {
				network.activate("e1", f);
				network.activate("e2", f);
			}

			const tokens = network.getCompleteTokens();
			expect(tokens).toHaveLength(6);
			for (const t of tokens) {
				expect(t.factBindings["e1"].id).not.toBe(t.factBindings["e2"].id);
			}
		});
	});

	describe("10-fact self-join", () => {
		it("produces 90 tokens (n*(n-1)), not 100 (n*n)", () => {
			const patterns: FactPattern[] = [
				{ $fact: "Entry", $bind: "e1", $join: { stackKey: "$e2.stackKey" } },
				{ $fact: "Entry", $bind: "e2", $join: { stackKey: "$e1.stackKey" } },
			];
			const network = compileBetaNetwork(patterns);

			const facts = Array.from({ length: 10 }, (_, i) => makeFact(`f${i}`, "Entry", { stackKey: "s1" }));

			for (const f of facts) {
				network.activate("e1", f);
				network.activate("e2", f);
			}

			const tokens = network.getCompleteTokens();
			expect(tokens).toHaveLength(90);
		});
	});

	describe("cross-type join (no self-exclusion needed)", () => {
		it("produces 4 tokens with 2 orders + 2 customers", () => {
			const patterns: FactPattern[] = [
				{ $fact: "Customer", $bind: "customer" },
				{ $fact: "Order", $bind: "order", $join: { customerId: "$customer.id" } },
			];
			const network = compileBetaNetwork(patterns);

			const c1 = makeFact("c1", "Customer", { id: "cust-1" });
			const c2 = makeFact("c2", "Customer", { id: "cust-1" });
			const o1 = makeFact("o1", "Order", { customerId: "cust-1" });
			const o2 = makeFact("o2", "Order", { customerId: "cust-1" });

			network.activate("customer", c1);
			network.activate("customer", c2);
			network.activate("order", o1);
			network.activate("order", o2);

			const tokens = network.getCompleteTokens();
			expect(tokens).toHaveLength(4);
		});
	});

	describe("self-join without constraints (cross-product)", () => {
		it("excludes self-matches in unconstrained self-join", () => {
			const patterns: FactPattern[] = [
				{ $fact: "Entry", $bind: "e1" },
				{ $fact: "Entry", $bind: "e2" },
			];
			const network = compileBetaNetwork(patterns);

			const a = makeFact("f1", "Entry", { val: 1 });
			const b = makeFact("f2", "Entry", { val: 2 });

			network.activate("e1", a);
			network.activate("e1", b);
			network.activate("e2", a);
			network.activate("e2", b);

			const tokens = network.getCompleteTokens();
			expect(tokens).toHaveLength(2);
			for (const t of tokens) {
				expect(t.factBindings["e1"].id).not.toBe(t.factBindings["e2"].id);
			}
		});
	});
});
