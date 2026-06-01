import { describe, expect, it } from "vitest";
import { compileBetaNetwork } from "../beta-network.js";
import type { Fact } from "../fact-memory.js";
import type { FactPattern } from "../fact-pattern.js";

function makeFact(id: string, type: string, data: Record<string, unknown>): Fact {
	return { id, type, data };
}

describe("compileBetaNetwork", () => {
	describe("single pattern (degenerate)", () => {
		it("produces a degenerate network", () => {
			const patterns: FactPattern[] = [{ $fact: "Order", $bind: "order" }];
			const network = compileBetaNetwork(patterns);
			expect(network.isDegenerate).toBe(true);
			expect(network.alphaFilters).toHaveLength(1);
			expect(network.joinNodes).toHaveLength(0);
		});

		it("activate returns token with one binding", () => {
			const patterns: FactPattern[] = [{ $fact: "Order", $bind: "order" }];
			const network = compileBetaNetwork(patterns);
			const fact = makeFact("f1", "Order", { total: 100 });
			const tokens = network.activate("order", fact);
			expect(tokens).toHaveLength(1);
			expect(tokens[0].factBindings["order"]).toBe(fact);
		});

		it("retract removes tokens", () => {
			const patterns: FactPattern[] = [{ $fact: "Order", $bind: "order" }];
			const network = compileBetaNetwork(patterns);
			const fact = makeFact("f1", "Order", { total: 100 });
			network.activate("order", fact);
			const removed = network.retract("f1");
			expect(removed).toHaveLength(1);
			expect(network.getCompleteTokens()).toHaveLength(0);
		});
	});

	describe("two patterns with join", () => {
		const patterns: FactPattern[] = [
			{ $fact: "Customer", $bind: "customer" },
			{ $fact: "Order", $bind: "order", $join: { customerId: "$customer.id" } },
		];

		it("produces correct network structure", () => {
			const network = compileBetaNetwork(patterns);
			expect(network.isDegenerate).toBe(false);
			expect(network.alphaFilters).toHaveLength(2);
			expect(network.joinNodes).toHaveLength(1);
		});

		it("complete token produced when both facts match", () => {
			const network = compileBetaNetwork(patterns);
			const customer = makeFact("c1", "Customer", { id: "cust-1" });
			const order = makeFact("o1", "Order", { customerId: "cust-1" });

			network.activate("customer", customer);
			const tokens = network.activate("order", order);
			expect(tokens).toHaveLength(1);
			expect(tokens[0].factBindings["customer"]).toBe(customer);
			expect(tokens[0].factBindings["order"]).toBe(order);
		});

		it("activate order does not matter (right first)", () => {
			const network = compileBetaNetwork(patterns);
			const customer = makeFact("c1", "Customer", { id: "cust-1" });
			const order = makeFact("o1", "Order", { customerId: "cust-1" });

			network.activate("order", order);
			const tokens = network.activate("customer", customer);
			expect(tokens).toHaveLength(1);
			expect(tokens[0].factBindings["customer"]).toBe(customer);
			expect(tokens[0].factBindings["order"]).toBe(order);
		});

		it("no match when join constraint fails", () => {
			const network = compileBetaNetwork(patterns);
			const customer = makeFact("c1", "Customer", { id: "cust-1" });
			const order = makeFact("o1", "Order", { customerId: "cust-WRONG" });

			network.activate("customer", customer);
			const tokens = network.activate("order", order);
			expect(tokens).toHaveLength(0);
		});

		it("retract invalidates tokens", () => {
			const network = compileBetaNetwork(patterns);
			const customer = makeFact("c1", "Customer", { id: "cust-1" });
			const order = makeFact("o1", "Order", { customerId: "cust-1" });

			network.activate("customer", customer);
			network.activate("order", order);
			const removed = network.retract("c1");
			expect(removed.length).toBeGreaterThan(0);
			expect(network.getCompleteTokens()).toHaveLength(0);
		});
	});

	describe("three patterns chained", () => {
		it("complete token has all three bindings", () => {
			const patterns: FactPattern[] = [
				{ $fact: "Customer", $bind: "customer" },
				{ $fact: "Order", $bind: "order", $join: { customerId: "$customer.id" } },
				{ $fact: "LineItem", $bind: "item", $join: { orderId: "$order.id" } },
			];
			const network = compileBetaNetwork(patterns);

			const customer = makeFact("c1", "Customer", { id: "cust-1" });
			const order = makeFact("o1", "Order", { id: "ord-1", customerId: "cust-1" });
			const item = makeFact("i1", "LineItem", { orderId: "ord-1", qty: 5 });

			network.activate("customer", customer);
			network.activate("order", order);
			const tokens = network.activate("item", item);

			expect(tokens).toHaveLength(1);
			expect(tokens[0].factBindings["customer"]).toBe(customer);
			expect(tokens[0].factBindings["order"]).toBe(order);
			expect(tokens[0].factBindings["item"]).toBe(item);
		});
	});
});
