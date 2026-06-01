import { describe, expect, it } from "vitest";
import type { AccumulateConfig } from "../accumulate-node.js";
import type { ProductionRule } from "../contracts.js";
import type { FactPattern } from "../fact-pattern.js";
import { createSession } from "../session.js";

const customerFactType = {
	name: "customer",
	fields: { name: "string" as const, vip: "boolean" as const, custId: "string" as const },
};

const orderFactType = {
	name: "order",
	fields: { amount: "number" as const, customerId: "string" as const },
};

const vipPatterns: FactPattern[] = [
	{ $fact: "customer", $bind: "customer", constraints: { vip: { $eq: true } } },
	{ $fact: "order", $bind: "order", $join: { customerId: "$customer.custId" } },
];

const vipOrderTotalAccumulate: AccumulateConfig = {
	factType: "order",
	field: "amount",
	fn: "$sum",
	alias: "vipOrderTotal",
	binding: "order",
	rule: "vip-orders",
};

const vipOrdersRule: ProductionRule = {
	name: "vip-orders",
	patterns: vipPatterns,
	when: { $always: true },
	then: [{ $set: { "status.vipMatched": true } }],
};

const thresholdRule: ProductionRule = {
	name: "vip-threshold",
	when: { "$aggregates.vipOrderTotal": { $gte: 100 } },
	then: [{ $set: { "alerts.vipHighSpend": true } }],
	else: [{ $set: { "alerts.vipHighSpend": false } }],
};

describe("cross-type-accumulate", () => {
	it("VIP customer + orders → sum only VIP orders", () => {
		const session = createSession({
			factTypes: [customerFactType, orderFactType],
			accumulates: [vipOrderTotalAccumulate],
			rules: [vipOrdersRule],
		});

		session.assertFact("customer", { name: "Alice", vip: true, custId: "alice-1" });
		session.assertFact("order", { amount: 50, customerId: "alice-1" });
		session.assertFact("order", { amount: 30, customerId: "alice-1" });
		session.assertFact("order", { amount: 20, customerId: "alice-1" });

		const agg = session.getPath("$aggregates.vipOrderTotal");
		expect(agg).toBe(100);
	});

	it("non-matching customer orders are not accumulated (no token)", () => {
		const session = createSession({
			factTypes: [customerFactType, orderFactType],
			accumulates: [vipOrderTotalAccumulate],
			rules: [vipOrdersRule],
		});

		// Customer has custId "bob-1" but orders reference "other-id" → no join match → no token
		session.assertFact("customer", { name: "Bob", vip: true, custId: "bob-1" });
		session.assertFact("order", { amount: 50, customerId: "other-id" });

		const agg = session.getPath("$aggregates.vipOrderTotal");
		expect(agg).toBe(0);
	});

	it("retract order → total decreases", () => {
		const session = createSession({
			factTypes: [customerFactType, orderFactType],
			accumulates: [vipOrderTotalAccumulate],
			rules: [vipOrdersRule],
		});

		session.assertFact("customer", { name: "Alice", vip: true, custId: "alice-1" });
		const orderId1 = session.assertFact("order", { amount: 50, customerId: "alice-1" });
		session.assertFact("order", { amount: 30, customerId: "alice-1" });

		expect(session.getPath("$aggregates.vipOrderTotal")).toBe(80);

		session.retractFact(orderId1);
		expect(session.getPath("$aggregates.vipOrderTotal")).toBe(30);
	});

	it("retract customer → total resets to 0 (all tokens removed)", () => {
		const session = createSession({
			factTypes: [customerFactType, orderFactType],
			accumulates: [vipOrderTotalAccumulate],
			rules: [vipOrdersRule],
		});

		const custId = session.assertFact("customer", { name: "Alice", vip: true, custId: "alice-1" });
		session.assertFact("order", { amount: 50, customerId: "alice-1" });
		session.assertFact("order", { amount: 30, customerId: "alice-1" });

		expect(session.getPath("$aggregates.vipOrderTotal")).toBe(80);

		session.retractFact(custId);
		expect(session.getPath("$aggregates.vipOrderTotal")).toBe(0);
	});

	it("reactive: rule fires on threshold crossing", () => {
		const session = createSession({
			factTypes: [customerFactType, orderFactType],
			accumulates: [vipOrderTotalAccumulate],
			rules: [vipOrdersRule, thresholdRule],
		});

		session.assertFact("customer", { name: "Alice", vip: true, custId: "alice-1" });
		session.assertFact("order", { amount: 50, customerId: "alice-1" });
		expect(session.getPath("alerts.vipHighSpend")).toBe(false);

		session.assertFact("order", { amount: 60, customerId: "alice-1" });
		expect(session.getPath("alerts.vipHighSpend")).toBe(true);
	});

	it("TMS retraction works when token is removed", () => {
		const session = createSession({
			factTypes: [customerFactType, orderFactType],
			accumulates: [vipOrderTotalAccumulate],
			rules: [vipOrdersRule, thresholdRule],
			tms: { enabled: true },
		});

		session.assertFact("customer", { name: "Alice", vip: true, custId: "alice-1" });
		session.assertFact("order", { amount: 50, customerId: "alice-1" });
		session.assertFact("order", { amount: 60, customerId: "alice-1" });

		expect(session.getPath("alerts.vipHighSpend")).toBe(true);

		// Retract customer removes all tokens, total → 0, threshold no longer met
		const custId = session.getFacts("customer")[0]?.id;
		session.retractFact(custId);
		session.fire();
		expect(session.getPath("alerts.vipHighSpend")).toBe(false);
	});
});
