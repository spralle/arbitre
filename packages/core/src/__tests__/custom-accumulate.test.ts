import { describe, expect, it } from "vitest";
import type { AccumulateFn, CustomAccumulateFunction } from "../accumulate-functions.js";
import { getAccumulateFn } from "../accumulate-functions.js";
import { createSession } from "../session.js";

const scoreFactType = {
	name: "score",
	fields: { value: "number" as const },
};

const measurementFactType = {
	name: "measurement",
	fields: { temperature: "number" as const },
};

describe("Custom Accumulate Functions", () => {
	const medianFn: AccumulateFn = (values) => {
		if (values.length === 0) return null;
		const sorted = [...values].sort((a, b) => a - b);
		const mid = Math.floor(sorted.length / 2);
		return sorted.length % 2 !== 0 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
	};

	const customMedian: CustomAccumulateFunction = { fn: medianFn };

	it("registers and uses a custom accumulate function via session config", () => {
		const session = createSession({
			factTypes: [scoreFactType],
			accumulateFunctions: { $median: customMedian },
			accumulates: [{ factType: "score", field: "value", fn: "$median", alias: "medianScore" }],
		});

		session.assertFact("score", { value: 10 });
		session.assertFact("score", { value: 20 });
		session.assertFact("score", { value: 30 });
		session.fire();

		const state = session.getState();
		const agg = state["$aggregates"] as Record<string, unknown>;
		expect(agg.medianScore).toBe(20);
	});

	it("custom function receives correct values on add/remove", () => {
		const session = createSession({
			factTypes: [scoreFactType],
			accumulateFunctions: { $median: customMedian },
			accumulates: [{ factType: "score", field: "value", fn: "$median", alias: "medianScore" }],
		});

		const id1 = session.assertFact("score", { value: 10 });
		session.assertFact("score", { value: 20 });
		session.assertFact("score", { value: 30 });
		session.fire();
		const agg1 = session.getState()["$aggregates"] as Record<string, unknown>;
		expect(agg1.medianScore).toBe(20);

		session.retractFact(id1);
		session.fire();
		const agg2 = session.getState()["$aggregates"] as Record<string, unknown>;
		expect(agg2.medianScore).toBe(25);
	});

	it("throws on unknown function name with helpful message", () => {
		expect(() => {
			getAccumulateFn("$unknown", { $median: customMedian });
		}).toThrow(/Unknown accumulate function: "\$unknown".*Available functions:.*\$sum.*\$median/);
	});

	it("built-in functions still work alongside custom", () => {
		const session = createSession({
			factTypes: [scoreFactType],
			accumulateFunctions: { $median: customMedian },
			accumulates: [
				{ factType: "score", field: "value", fn: "$sum", alias: "totalScore" },
				{ factType: "score", field: "value", fn: "$median", alias: "medianScore" },
			],
		});

		session.assertFact("score", { value: 10 });
		session.assertFact("score", { value: 20 });
		session.assertFact("score", { value: 30 });
		session.fire();

		const agg = session.getState()["$aggregates"] as Record<string, unknown>;
		expect(agg.totalScore).toBe(60);
		expect(agg.medianScore).toBe(20);
	});

	it("custom function with field extraction works", () => {
		const session = createSession({
			factTypes: [measurementFactType],
			accumulateFunctions: { $median: customMedian },
			accumulates: [{ factType: "measurement", field: "temperature", fn: "$median", alias: "medianTemp" }],
		});

		session.assertFact("measurement", { temperature: 72 });
		session.assertFact("measurement", { temperature: 68 });
		session.assertFact("measurement", { temperature: 75 });
		session.assertFact("measurement", { temperature: 80 });
		session.fire();

		const agg = session.getState()["$aggregates"] as Record<string, unknown>;
		// sorted: [68, 72, 75, 80] → median = (72+75)/2 = 73.5
		expect(agg.medianTemp).toBe(73.5);
	});
});
