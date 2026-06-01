import { describe, expect, it } from "vitest";
import type { Token } from "../beta-node.js";
import { createBetaNode } from "../beta-node.js";
import type { Fact } from "../fact-memory.js";
import { createJoinNode } from "../join-node.js";

function makeFact(id: string, type: string, data: Record<string, unknown>): Fact {
	return { id, type, data };
}

function makeToken(id: string, bindings: Record<string, Fact>): Token {
	return { id, factBindings: bindings };
}

describe("createBetaNode", () => {
	it("stores and retrieves tokens", () => {
		const beta = createBetaNode();
		const token = makeToken("t1", { order: makeFact("f1", "Order", { amount: 100 }) });
		beta.leftActivate(token);
		expect(beta.getTokens()).toHaveLength(1);
		expect(beta.getTokens()[0].id).toBe("t1");
	});

	it("removes tokens by fact id", () => {
		const beta = createBetaNode();
		const fact = makeFact("f1", "Order", {});
		beta.leftActivate(makeToken("t1", { order: fact }));
		beta.leftActivate(makeToken("t2", { item: makeFact("f2", "Item", {}) }));
		const removed = beta.removeFactTokens("f1");
		expect(removed).toHaveLength(1);
		expect(beta.getTokens()).toHaveLength(1);
	});

	it("clears all tokens", () => {
		const beta = createBetaNode();
		beta.leftActivate(makeToken("t1", {}));
		beta.leftActivate(makeToken("t2", {}));
		beta.clear();
		expect(beta.getTokens()).toHaveLength(0);
	});
});

describe("createJoinNode", () => {
	const orderCustomerConstraint = {
		leftBinding: "order",
		leftField: "customerId",
		rightBinding: "customer",
		rightField: "id",
	};

	describe("2-way join", () => {
		it("right-activate then left-activate produces joined token", () => {
			const join = createJoinNode({ joinConstraints: [orderCustomerConstraint] });
			const customer = makeFact("c1", "Customer", { id: "cust-1", name: "Alice" });
			const order = makeFact("o1", "Order", { customerId: "cust-1", amount: 50 });

			join.rightActivate("customer", customer);
			const token = makeToken("t1", { order });
			const results = join.leftActivate(token);

			expect(results).toHaveLength(1);
			expect(results[0].factBindings["order"]).toBe(order);
			expect(results[0].factBindings["customer"]).toBe(customer);
		});

		it("left-activate then right-activate produces joined token", () => {
			const join = createJoinNode({ joinConstraints: [orderCustomerConstraint] });
			const order = makeFact("o1", "Order", { customerId: "cust-1", amount: 50 });
			const customer = makeFact("c1", "Customer", { id: "cust-1", name: "Alice" });

			const token = makeToken("t1", { order });
			join.leftActivate(token);
			const results = join.rightActivate("customer", customer);

			expect(results).toHaveLength(1);
			expect(results[0].factBindings["order"]).toBe(order);
			expect(results[0].factBindings["customer"]).toBe(customer);
		});

		it("no match when constraints not satisfied", () => {
			const join = createJoinNode({ joinConstraints: [orderCustomerConstraint] });
			const customer = makeFact("c1", "Customer", { id: "cust-99", name: "Bob" });
			const order = makeFact("o1", "Order", { customerId: "cust-1", amount: 50 });

			join.rightActivate("customer", customer);
			const results = join.leftActivate(makeToken("t1", { order }));

			expect(results).toHaveLength(0);
		});

		it("multiple matches: one fact joins with multiple tokens", () => {
			const join = createJoinNode({ joinConstraints: [orderCustomerConstraint] });
			const order1 = makeFact("o1", "Order", { customerId: "cust-1", amount: 10 });
			const order2 = makeFact("o2", "Order", { customerId: "cust-1", amount: 20 });
			const customer = makeFact("c1", "Customer", { id: "cust-1", name: "Alice" });

			join.leftActivate(makeToken("t1", { order: order1 }));
			join.leftActivate(makeToken("t2", { order: order2 }));
			const results = join.rightActivate("customer", customer);

			expect(results).toHaveLength(2);
			expect(join.getOutputTokens()).toHaveLength(2);
		});
	});

	describe("retraction", () => {
		it("retract a fact removes tokens containing it", () => {
			const join = createJoinNode({ joinConstraints: [orderCustomerConstraint] });
			const customer = makeFact("c1", "Customer", { id: "cust-1", name: "Alice" });
			const order = makeFact("o1", "Order", { customerId: "cust-1", amount: 50 });

			join.rightActivate("customer", customer);
			join.leftActivate(makeToken("t1", { order }));
			expect(join.getOutputTokens()).toHaveLength(1);

			const removed = join.retractFact("c1");
			expect(removed).toHaveLength(1);
			expect(join.getOutputTokens()).toHaveLength(0);
		});
	});

	describe("missing bindings", () => {
		it("returns no join result when a referenced binding is missing", () => {
			// Constraint references "order" binding but token only has "item"
			const join = createJoinNode({
				joinConstraints: [
					{ leftBinding: "order", leftField: "customerId", rightBinding: "customer", rightField: "id" },
				],
			});

			const customer = makeFact("c1", "Customer", { id: "cust-1" });
			join.rightActivate("customer", customer);

			// Token does NOT have "order" binding — constraint references missing binding
			const token = makeToken("t1", { item: makeFact("i1", "Item", { name: "widget" }) });
			const results = join.leftActivate(token);

			expect(results).toHaveLength(0);
		});
	});

	describe("3-way join", () => {
		it("chains two join nodes: Order → Customer → Address", () => {
			// First join: Order.customerId == Customer.id
			const join1 = createJoinNode({ joinConstraints: [orderCustomerConstraint] });

			// Second join: Customer.addressId == Address.id
			const join2 = createJoinNode({
				joinConstraints: [
					{ leftBinding: "customer", leftField: "addressId", rightBinding: "address", rightField: "id" },
				],
			});

			const customer = makeFact("c1", "Customer", { id: "cust-1", name: "Alice", addressId: "addr-1" });
			const order = makeFact("o1", "Order", { customerId: "cust-1", amount: 50 });
			const address = makeFact("a1", "Address", { id: "addr-1", city: "Portland" });

			// Feed into first join
			join1.rightActivate("customer", customer);
			const tokens1 = join1.leftActivate(makeToken("t1", { order }));
			expect(tokens1).toHaveLength(1);

			// Feed result of first join into second join as left-activate
			join2.rightActivate("address", address);
			const tokens2 = join2.leftActivate(tokens1[0]);
			expect(tokens2).toHaveLength(1);

			// Final token has all three bindings
			expect(tokens2[0].factBindings["order"]).toBe(order);
			expect(tokens2[0].factBindings["customer"]).toBe(customer);
			expect(tokens2[0].factBindings["address"]).toBe(address);
		});
	});
});
