import { describe, expect, it } from "vitest";
import type { AccumulateConfig } from "../accumulate-node.js";
import type { ProductionRule } from "../contracts.js";
import { createSession } from "../session.js";

const orderFactType = {
	name: "order",
	fields: { amount: "number" as const, status: "string" as const },
};

const countAccumulate: AccumulateConfig = {
	factType: "order",
	fn: "$count",
	field: "",
	alias: "orderCount",
};

function makeThresholdRule(threshold: number): ProductionRule {
	return {
		name: "threshold-rule",
		when: { "$aggregates.orderCount": { $gt: threshold } },
		then: [{ $set: { "alerts.thresholdCrossed": true } }],
		else: [{ $set: { "alerts.thresholdCrossed": false } }],
	};
}

describe("reactive-aggregates", () => {
	it("assert fact → accumulate changes → dependent rule fires automatically", () => {
		const session = createSession({
			factTypes: [orderFactType],
			accumulates: [countAccumulate],
			rules: [makeThresholdRule(0)],
		});

		session.assertFact("order", { amount: 100, status: "open" });

		expect(session.getPath("alerts.thresholdCrossed")).toBe(true);
	});

	it("rule fires when threshold crossed (count goes 9→10, condition $gt: 9)", () => {
		const session = createSession({
			factTypes: [orderFactType],
			accumulates: [countAccumulate],
			rules: [makeThresholdRule(9)],
		});

		// Assert 9 orders — threshold not crossed, rule never active → no else fired
		for (let i = 0; i < 9; i++) {
			session.assertFact("order", { amount: 10, status: "open" });
		}
		expect(session.getPath("alerts.thresholdCrossed")).toBeUndefined();

		// 10th order crosses threshold
		session.assertFact("order", { amount: 10, status: "open" });
		expect(session.getPath("alerts.thresholdCrossed")).toBe(true);
	});

	it("TMS retracts rule writes when aggregate drops below threshold", () => {
		const session = createSession({
			factTypes: [orderFactType],
			accumulates: [countAccumulate],
			rules: [makeThresholdRule(2)],
		});

		const id1 = session.assertFact("order", { amount: 10, status: "open" });
		const id2 = session.assertFact("order", { amount: 20, status: "open" });
		session.assertFact("order", { amount: 30, status: "open" });

		expect(session.getPath("alerts.thresholdCrossed")).toBe(true);

		// Retract two facts → count drops to 1, below threshold
		session.retractFact(id2);
		session.retractFact(id1);

		expect(session.getPath("alerts.thresholdCrossed")).toBe(false);
	});

	it("no infinite loops: refraction prevents re-firing on same cycle", () => {
		const session = createSession({
			factTypes: [orderFactType],
			accumulates: [countAccumulate],
			rules: [makeThresholdRule(0)],
			limits: { maxCycles: 10, maxRuleFirings: 10 },
		});

		// Should not throw cycle/firing limit errors
		session.assertFact("order", { amount: 100, status: "open" });
		session.assertFact("order", { amount: 200, status: "open" });
		session.assertFact("order", { amount: 300, status: "open" });

		expect(session.getPath("alerts.thresholdCrossed")).toBe(true);
	});

	it("performance: 50 fact assertions do not cause exponential re-evaluations", () => {
		const session = createSession({
			factTypes: [orderFactType],
			accumulates: [countAccumulate],
			rules: [makeThresholdRule(9)],
			limits: { maxCycles: 100, maxRuleFirings: 1000 },
		});

		for (let i = 0; i < 50; i++) {
			session.assertFact("order", { amount: i, status: "open" });
		}

		expect(session.getPath("alerts.thresholdCrossed")).toBe(true);
	});

	it("autoFireOnFactChange: false prevents auto-fire", () => {
		const session = createSession({
			factTypes: [orderFactType],
			accumulates: [countAccumulate],
			rules: [makeThresholdRule(0)],
			autoFireOnFactChange: false,
		});

		session.assertFact("order", { amount: 100, status: "open" });

		// Rule has NOT fired yet
		expect(session.getPath("alerts.thresholdCrossed")).toBeUndefined();

		// Manual fire triggers it
		session.fire();
		expect(session.getPath("alerts.thresholdCrossed")).toBe(true);
	});
});
