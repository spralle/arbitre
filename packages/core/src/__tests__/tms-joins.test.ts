import { describe, expect, it } from "vitest";
import type { ProductionRule, SessionConfig } from "../contracts.js";
import { createSession } from "../session.js";
import { createTms } from "../tms.js";

function makeConfig(rules: readonly ProductionRule[], tmsMode?: "all"): SessionConfig {
	return {
		factTypes: [
			{ name: "Order", fields: { status: "string", amount: "number", customerId: "string" } },
			{ name: "Customer", fields: { id: "string", tier: "string" } },
		],
		rules,
		tms: tmsMode ? { autoRetract: tmsMode } : { autoRetract: "all" },
	};
}

describe("TMS Join Derivations", () => {
	it("single-pattern rule: retract fact reverts writes", () => {
		const rule: ProductionRule = {
			name: "process-order",
			when: {},
			then: [{ $set: { "$ui.orderActive": true } }],
			patterns: [{ $fact: "Order", $bind: "order" }],
		};

		const session = createSession(makeConfig([rule]));
		const factId = session.assertFact("Order", { status: "pending", amount: 100, customerId: "c1" });
		session.fire();
		expect(session.getPath("$ui.orderActive")).toBe(true);

		// Retract the fact — TMS should revert the write
		session.retractFact(factId);
		expect(session.getPath("$ui.orderActive")).toBeUndefined();
	});

	it("two-pattern join rule: retract one fact reverts writes", () => {
		const rule: ProductionRule = {
			name: "vip-order",
			when: {},
			then: [{ $set: { "$ui.vipOrder": true } }],
			patterns: [
				{ $fact: "Order", $bind: "order" },
				{ $fact: "Customer", $bind: "customer", $join: { id: "$order.customerId" } },
			],
		};

		const session = createSession(makeConfig([rule]));
		const orderId = session.assertFact("Order", { status: "pending", amount: 50, customerId: "c1" });
		session.assertFact("Customer", { id: "c1", tier: "gold" });
		session.fire();
		expect(session.getPath("$ui.vipOrder")).toBe(true);

		// Retract the order fact — TMS should revert
		session.retractFact(orderId);
		expect(session.getPath("$ui.vipOrder")).toBeUndefined();
	});

	it("multi-fact rule: retract either contributing fact triggers retraction", () => {
		const rule: ProductionRule = {
			name: "vip-order",
			when: {},
			then: [{ $set: { "$ui.matched": true } }],
			patterns: [
				{ $fact: "Order", $bind: "order" },
				{ $fact: "Customer", $bind: "customer", $join: { id: "$order.customerId" } },
			],
		};

		const session = createSession(makeConfig([rule]));
		session.assertFact("Order", { status: "pending", amount: 50, customerId: "c1" });
		const customerId = session.assertFact("Customer", { id: "c1", tier: "gold" });
		session.fire();
		expect(session.getPath("$ui.matched")).toBe(true);

		// Retract customer (the second fact) — should also revert
		session.retractFact(customerId);
		expect(session.getPath("$ui.matched")).toBeUndefined();
	});

	it("TMS provenance records include fact IDs", () => {
		const tms = createTms({ autoRetract: "all" });
		tms.recordFactDependency("test-rule", ["fact-1", "fact-2"]);

		const provenance = tms.getProvenance("test-rule");
		expect(provenance).toHaveLength(1);
		expect(provenance[0]?.ruleName).toBe("test-rule");
		expect(provenance[0]?.factIds).toContain("fact-1");
		expect(provenance[0]?.factIds).toContain("fact-2");
	});

	it("existing scope-only TMS behavior unchanged", () => {
		const rule: ProductionRule = {
			name: "scope-rule",
			when: { "flags.active": true },
			then: [{ $set: { "$ui.visible": true } }],
		};

		const session = createSession(makeConfig([rule]));

		// Activate scope condition
		session.assert("flags.active", true);
		session.fire();
		expect(session.getPath("$ui.visible")).toBe(true);

		// Deactivate scope condition — TMS should auto-retract
		session.assert("flags.active", false);
		session.fire();
		expect(session.getPath("$ui.visible")).toBeUndefined();
	});

	it("cascade: rule depends on fact → writes state; retract fact → state reverted", () => {
		const ruleA: ProductionRule = {
			name: "rule-a",
			when: {},
			then: [{ $set: { "$ui.fromFact": true } }],
			patterns: [{ $fact: "Order", $bind: "order" }],
		};

		// Rule B depends on the scope state written by rule A
		const ruleB: ProductionRule = {
			name: "rule-b",
			when: { "$ui.fromFact": true },
			then: [{ $set: { "$ui.cascaded": true } }],
		};

		const session = createSession(makeConfig([ruleA, ruleB]));
		const factId = session.assertFact("Order", { status: "pending", amount: 100, customerId: "c1" });
		session.fire();
		expect(session.getPath("$ui.fromFact")).toBe(true);
		expect(session.getPath("$ui.cascaded")).toBe(true);

		// Retract the fact — rule A's write reverted, rule B should also deactivate
		session.retractFact(factId);
		expect(session.getPath("$ui.fromFact")).toBeUndefined();

		// Fire again to propagate the cascade
		session.fire();
		expect(session.getPath("$ui.cascaded")).toBeUndefined();
	});
});
