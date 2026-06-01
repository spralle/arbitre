import { describe, expect, it } from "vitest";
import type { ProductionRule, SessionConfig } from "../contracts.js";
import { createSession } from "../session.js";

function makeConfig(rules: readonly ProductionRule[]): SessionConfig {
	return {
		factTypes: [
			{ name: "Order", fields: { status: "string", amount: "number", customerId: "string" } },
			{ name: "Customer", fields: { id: "string", name: "string", tier: "string" } },
		],
		rules,
	};
}

describe("Token Binding Injection into Action Scope", () => {
	it("fact bindings accessible via $facts path in then stage", () => {
		const rule: ProductionRule = {
			name: "copy-amount",
			when: {},
			then: [{ $set: { "result.amount": "$facts.order.amount" } }],
			patterns: [{ $fact: "Order", $bind: "order", $where: { status: "pending" } }],
		};

		const session = createSession(makeConfig([rule]));
		session.assertFact("Order", { status: "pending", amount: 250, customerId: "c1" });
		session.fire();

		expect(session.getPath("result.amount")).toBe(250);
	});

	it("multiple bindings accessible simultaneously", () => {
		const rule: ProductionRule = {
			name: "join-data",
			when: {},
			then: [
				{ $set: { "result.orderAmount": "$facts.order.amount" } },
				{ $set: { "result.customerName": "$facts.customer.name" } },
			],
			patterns: [
				{ $fact: "Order", $bind: "order" },
				{ $fact: "Customer", $bind: "customer", $join: { id: "$order.customerId" } },
			],
		};

		const session = createSession(makeConfig([rule]));
		session.assertFact("Order", { status: "pending", amount: 500, customerId: "c1" });
		session.assertFact("Customer", { id: "c1", name: "Alice", tier: "gold" });
		session.fire();

		expect(session.getPath("result.orderAmount")).toBe(500);
		expect(session.getPath("result.customerName")).toBe("Alice");
	});

	it("bindings cleared after rule fires (not persisted in scope)", () => {
		const rule: ProductionRule = {
			name: "use-binding",
			when: {},
			then: [{ $set: { "result.captured": "$facts.order.amount" } }],
			patterns: [{ $fact: "Order", $bind: "order" }],
		};

		const session = createSession(makeConfig([rule]));
		session.assertFact("Order", { status: "pending", amount: 42, customerId: "c1" });
		session.fire();

		// The binding value was captured
		expect(session.getPath("result.captured")).toBe(42);
		// But $facts namespace is cleared from scope
		expect(session.getPath("facts")).toBeUndefined();
		expect(session.getPath("facts.order")).toBeUndefined();
	});

	it("binding values match the asserted fact data", () => {
		const rule: ProductionRule = {
			name: "check-data",
			when: {},
			then: [
				{ $set: { "result.status": "$facts.order.status" } },
				{ $set: { "result.customerId": "$facts.order.customerId" } },
			],
			patterns: [{ $fact: "Order", $bind: "order", $where: { status: "shipped" } }],
		};

		const session = createSession(makeConfig([rule]));
		session.assertFact("Order", { status: "shipped", amount: 99, customerId: "cx" });
		session.fire();

		expect(session.getPath("result.status")).toBe("shipped");
		expect(session.getPath("result.customerId")).toBe("cx");
	});

	it("works with expression operators referencing $facts paths", () => {
		const rule: ProductionRule = {
			name: "compute",
			when: {},
			then: [
				{
					$set: {
						"result.doubled": { $multiply: ["$facts.order.amount", 2] },
					},
				},
			],
			patterns: [{ $fact: "Order", $bind: "order" }],
		};

		const session = createSession(makeConfig([rule]));
		session.assertFact("Order", { status: "pending", amount: 10, customerId: "c1" });
		session.fire();

		expect(session.getPath("result.doubled")).toBe(20);
	});
});
