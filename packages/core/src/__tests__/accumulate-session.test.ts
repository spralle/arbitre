import { describe, expect, it } from "vitest";
import type { AccumulateConfig } from "../accumulate-node.js";
import { createSession } from "../session.js";

const orderFactType = {
	name: "order",
	fields: { amount: "number" as const, status: "string" as const },
};

describe("accumulate-session", () => {
	it("session without accumulates still works (backward compat)", () => {
		const session = createSession({
			factTypes: [orderFactType],
		});
		const id = session.assertFact("order", { amount: 100, status: "open" });
		expect(id).toBeDefined();
		expect(session.getState()["$aggregates"]).toBeUndefined();
	});

	it("session with accumulates config creates working accumulate support", () => {
		const accumulates: AccumulateConfig[] = [{ factType: "order", fn: "$count", field: "", alias: "orderCount" }];
		const session = createSession({
			factTypes: [orderFactType],
			accumulates,
		});
		session.assertFact("order", { amount: 50, status: "open" });
		const agg = session.getState()["$aggregates"] as Record<string, unknown>;
		expect(agg).toBeDefined();
		expect(agg.orderCount).toBe(1);
	});

	it("assertFact updates aggregate values", () => {
		const accumulates: AccumulateConfig[] = [{ factType: "order", fn: "$sum", field: "amount", alias: "totalAmount" }];
		const session = createSession({
			factTypes: [orderFactType],
			accumulates,
		});
		session.assertFact("order", { amount: 100, status: "open" });
		session.assertFact("order", { amount: 200, status: "open" });
		const agg = session.getState()["$aggregates"] as Record<string, unknown>;
		expect(agg.totalAmount).toBe(300);
	});

	it("retractFact updates aggregate values", () => {
		const accumulates: AccumulateConfig[] = [{ factType: "order", fn: "$sum", field: "amount", alias: "totalAmount" }];
		const session = createSession({
			factTypes: [orderFactType],
			accumulates,
		});
		const id1 = session.assertFact("order", { amount: 100, status: "open" });
		session.assertFact("order", { amount: 200, status: "open" });
		session.retractFact(id1);
		const agg = session.getState()["$aggregates"] as Record<string, unknown>;
		expect(agg.totalAmount).toBe(200);
	});

	it("multiple accumulators with different configs work simultaneously", () => {
		const accumulates: AccumulateConfig[] = [
			{ factType: "order", fn: "$count", field: "", alias: "orderCount" },
			{ factType: "order", fn: "$sum", field: "amount", alias: "totalAmount" },
			{ factType: "order", fn: "$avg", field: "amount", alias: "avgAmount" },
		];
		const session = createSession({
			factTypes: [orderFactType],
			accumulates,
		});
		session.assertFact("order", { amount: 100, status: "open" });
		session.assertFact("order", { amount: 200, status: "open" });
		const agg = session.getState()["$aggregates"] as Record<string, unknown>;
		expect(agg["orderCount"]).toBe(2);
		expect(agg["totalAmount"]).toBe(300);
		expect(agg["avgAmount"]).toBe(150);
	});

	it("aggregate values accessible at $aggregates.alias path", () => {
		const accumulates: AccumulateConfig[] = [{ factType: "order", fn: "$count", field: "", alias: "orderCount" }];
		const session = createSession({
			factTypes: [orderFactType],
			accumulates,
		});
		session.assertFact("order", { amount: 50, status: "open" });
		expect(session.getPath("$aggregates.orderCount")).toBe(1);
	});

	it("count function works (no field needed)", () => {
		const accumulates: AccumulateConfig[] = [{ factType: "order", fn: "$count", field: "", alias: "cnt" }];
		const session = createSession({
			factTypes: [orderFactType],
			accumulates,
		});
		session.assertFact("order", { amount: 10, status: "open" });
		session.assertFact("order", { amount: 20, status: "closed" });
		expect(session.getPath("$aggregates.cnt")).toBe(2);
	});

	it("sum function works (field required)", () => {
		const accumulates: AccumulateConfig[] = [{ factType: "order", fn: "$sum", field: "amount", alias: "total" }];
		const session = createSession({
			factTypes: [orderFactType],
			accumulates,
		});
		session.assertFact("order", { amount: 10, status: "open" });
		session.assertFact("order", { amount: 30, status: "open" });
		expect(session.getPath("$aggregates.total")).toBe(40);
	});
});
