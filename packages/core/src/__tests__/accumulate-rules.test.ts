import { describe, expect, it } from "vitest";
import type { ProductionRule } from "../contracts.js";
import { compileRule } from "../rule-compiler.js";
import { createSession } from "../session.js";

describe("accumulate-rules", () => {
	it("compiles a rule with inline accumulate config", () => {
		const rule: ProductionRule = {
			name: "count-alert",
			accumulate: [{ factType: "order", fn: "$count", field: "", alias: "orderCount" }],
			when: { "$aggregates.orderCount": { $gt: 5 } },
			then: [{ $set: { "$state.alert": true } }],
		};

		const compiled = compileRule(rule);
		expect(compiled.accumulates).toHaveLength(1);
		expect(compiled.accumulates?.[0].alias).toBe("orderCount");
	});

	it("compiles a rule without accumulate unchanged", () => {
		const rule: ProductionRule = {
			name: "simple",
			when: { "$state.x": { $gt: 0 } },
			then: [{ $set: { "$state.y": 1 } }],
		};

		const compiled = compileRule(rule);
		expect(compiled.accumulates).toBeUndefined();
	});

	it("throws for invalid fn in accumulate config", () => {
		const rule: ProductionRule = {
			name: "bad-fn",
			accumulate: [{ factType: "order", fn: "invalid", field: "x", alias: "a" }],
			when: { "$state.x": { $gt: 0 } },
			then: [{ $set: { "$state.y": 1 } }],
		};

		expect(() => compileRule(rule)).toThrow(/fn must be one of/);
	});

	it("throws for missing field when fn requires it", () => {
		const rule: ProductionRule = {
			name: "no-field",
			accumulate: [{ factType: "order", fn: "$sum", field: "", alias: "total" }],
			when: { "$state.x": { $gt: 0 } },
			then: [{ $set: { "$state.y": 1 } }],
		};

		expect(() => compileRule(rule)).toThrow(/field is required/);
	});

	it("throws for duplicate alias within a rule", () => {
		const rule: ProductionRule = {
			name: "dup-alias",
			accumulate: [
				{ factType: "order", fn: "$count", field: "", alias: "x" },
				{ factType: "item", fn: "$count", field: "", alias: "x" },
			],
			when: { "$state.x": { $gt: 0 } },
			then: [{ $set: { "$state.y": 1 } }],
		};

		expect(() => compileRule(rule)).toThrow(/duplicate alias/);
	});

	it("registers rule accumulates in session and exposes aggregates", () => {
		const rule: ProductionRule = {
			name: "sum-alert",
			accumulate: [{ factType: "order", fn: "$sum", field: "amount", alias: "orderTotal" }],
			when: { "$aggregates.orderTotal": { $gt: 100 } },
			then: [{ $set: { "$state.alert": true } }],
		};

		const session = createSession({
			factTypes: [{ name: "order", fields: { amount: "number" } }],
			rules: [rule],
		});

		session.assertFact("order", { amount: 50 });
		session.assertFact("order", { amount: 60 });

		// Auto-fire triggers rule evaluation on each assertFact when accumulates change.
		// Manual fire() returns 0 because the rule already fired via auto-fire.
		const result = session.fire();
		expect(result.rulesFired).toBe(0);
		expect(session.getPath("$state.alert")).toBe(true);
	});

	it("multiple rules can share accumulate alias (merged)", () => {
		const rule1: ProductionRule = {
			name: "rule1",
			accumulate: [{ factType: "order", fn: "$count", field: "", alias: "orderCount" }],
			when: { "$aggregates.orderCount": { $gt: 0 } },
			then: [{ $set: { "$state.r1": true } }],
		};

		const rule2: ProductionRule = {
			name: "rule2",
			accumulate: [{ factType: "order", fn: "$count", field: "", alias: "orderCount" }],
			when: { "$aggregates.orderCount": { $gt: 1 } },
			then: [{ $set: { "$state.r2": true } }],
		};

		const session = createSession({
			factTypes: [{ name: "order", fields: {} }],
			rules: [rule1, rule2],
		});

		session.assertFact("order", {});
		session.assertFact("order", {});
		session.fire();

		expect(session.getPath("$state.r1")).toBe(true);
		expect(session.getPath("$state.r2")).toBe(true);
	});
});
