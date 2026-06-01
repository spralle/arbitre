import { describe, expect, it } from "vitest";
import type { ProductionRule } from "../contracts.js";
import type { FactPattern } from "../fact-pattern.js";
import { compileRule } from "../rule-compiler.js";
import { validatePatterns } from "../validate-patterns.js";

function makeRule(patterns?: readonly FactPattern[]): ProductionRule {
	return {
		name: "test-rule",
		when: { "order.status": "pending" },
		then: [{ $set: { "order.processed": true } }],
		patterns,
	};
}

describe("FactPattern validation", () => {
	it("valid pattern compiles without error", () => {
		const rule = makeRule([{ $fact: "Order", $bind: "order", $where: { status: "pending" } }]);
		const compiled = compileRule(rule as ProductionRule<unknown>);
		expect(compiled.hasPatterns).toBe(true);
		expect(compiled.patterns).toHaveLength(1);
		expect(compiled.patterns?.[0].$fact).toBe("Order");
		expect(compiled.patterns?.[0].$bind).toBe("order");
	});

	it("missing $fact throws validation error", () => {
		expect(() => validatePatterns([{ $fact: "", $bind: "x" }], "test")).toThrow("$fact");
	});

	it("missing $bind throws validation error", () => {
		expect(() => validatePatterns([{ $fact: "Order", $bind: "" }], "test")).toThrow("$bind");
	});

	it("duplicate $bind names throw", () => {
		expect(() =>
			validatePatterns(
				[
					{ $fact: "Order", $bind: "o" },
					{ $fact: "Customer", $bind: "o" },
				],
				"test",
			),
		).toThrow("duplicate");
	});

	it("invalid $join reference throws", () => {
		expect(() =>
			validatePatterns([{ $fact: "Order", $bind: "order", $join: { customerId: "$unknown.id" } }], "test"),
		).toThrow("unknown binding");
	});

	it("valid $join referencing earlier binding passes", () => {
		expect(() =>
			validatePatterns(
				[
					{ $fact: "Customer", $bind: "customer" },
					{ $fact: "Order", $bind: "order", $join: { customerId: "$customer.id" } },
				],
				"test",
			),
		).not.toThrow();
	});

	it("$where must be a non-null object", () => {
		expect(() =>
			validatePatterns([{ $fact: "Order", $bind: "o", $where: null as unknown as Record<string, unknown> }], "test"),
		).toThrow("$where");
	});

	it("rules without patterns compile identically to before", () => {
		const rule = makeRule(undefined);
		const compiled = compileRule(rule as ProductionRule<unknown>);
		expect(compiled.hasPatterns).toBe(false);
		expect(compiled.patterns).toBeUndefined();
		expect(compiled.name).toBe("test-rule");
		expect(compiled.salience).toBe(0);
	});
});
