import { describe, expect, it } from "vitest";
import { createVirtualClock } from "../clock.js";
import type { Fact } from "../fact-memory.js";
import { createSession } from "../session.js";
import { createWindowedAccumulateNode } from "../windowed-accumulate.js";

describe("createWindowedAccumulateNode", () => {
	const makeFact = (id: string, type: string, data: Record<string, unknown>): Fact => ({
		id,
		type,
		data,
	});

	it("includes facts within window and excludes expired ones", () => {
		const node = createWindowedAccumulateNode({
			factType: "event",
			field: "value",
			fn: "$count",
			alias: "eventCount",
			window: 5000,
		});

		const fact = makeFact("f1", "event", { value: 1 });
		node.addFact(fact, 0);

		expect(node.getValue()).toBe(1);

		// At t=4999, still in window
		expect(node.evict(4999)).toBe(false);
		expect(node.getValue()).toBe(1);

		// At t=5001, fact at t=0 is outside [5001-5000, 5001] = [1, 5001]
		expect(node.evict(5001)).toBe(true);
		expect(node.getValue()).toBe(0);
	});

	it("keeps only recent facts with multiple assertions", () => {
		const node = createWindowedAccumulateNode({
			factType: "event",
			field: "value",
			fn: "$count",
			alias: "eventCount",
			window: 5000,
		});

		node.addFact(makeFact("f1", "event", { value: 1 }), 0);
		node.addFact(makeFact("f2", "event", { value: 2 }), 1000);
		node.addFact(makeFact("f3", "event", { value: 3 }), 2000);

		// At t=5500: cutoff=500, f1(t=0) evicted, f2(t=1000) and f3(t=2000) remain
		expect(node.evict(5500)).toBe(true);
		expect(node.getValue()).toBe(2);
	});

	it("works with $sum aggregation", () => {
		const node = createWindowedAccumulateNode({
			factType: "sale",
			field: "amount",
			fn: "$sum",
			alias: "totalSales",
			window: 3000,
		});

		node.addFact(makeFact("f1", "sale", { amount: 10 }), 0);
		node.addFact(makeFact("f2", "sale", { amount: 20 }), 1500);
		node.addFact(makeFact("f3", "sale", { amount: 30 }), 2500);

		expect(node.getValue()).toBe(60);

		// At t=3500: cutoff=500, f1 evicted
		node.evict(3500);
		expect(node.getValue()).toBe(50);
	});

	it("works with $collect", () => {
		const node = createWindowedAccumulateNode({
			factType: "log",
			field: "msg",
			fn: "$collect",
			alias: "logs",
			window: 2000,
		});

		node.addFact(makeFact("f1", "log", { msg: "a" }), 0);
		node.addFact(makeFact("f2", "log", { msg: "b" }), 1500);

		expect(node.getValue()).toEqual([{ msg: "a" }, { msg: "b" }]);

		node.evict(2500);
		expect(node.getValue()).toEqual([{ msg: "b" }]);
	});

	it("removeFact works independently of eviction", () => {
		const node = createWindowedAccumulateNode({
			factType: "event",
			field: "value",
			fn: "$count",
			alias: "c",
			window: 5000,
		});

		const fact = makeFact("f1", "event", { value: 1 });
		node.addFact(fact, 0);
		node.removeFact(fact);
		expect(node.getValue()).toBe(0);
	});

	it("ignores facts that don't match filter", () => {
		const node = createWindowedAccumulateNode({
			factType: "event",
			field: "value",
			fn: "$count",
			alias: "c",
			window: 5000,
			filter: { category: "important" },
		});

		node.addFact(makeFact("f1", "event", { value: 1, category: "trivial" }), 0);
		node.addFact(makeFact("f2", "event", { value: 2, category: "important" }), 0);

		expect(node.getValue()).toBe(1);
	});
});

describe("windowed accumulate integration with session", () => {
	it("evicts stale facts on tick with virtual clock", () => {
		const clock = createVirtualClock(0);
		const session = createSession({
			clock,
			factTypes: [{ name: "event", fields: { value: "number" } }],
			accumulates: [{ factType: "event", field: "value", fn: "$count", alias: "eventCount", window: 5000 }],
			rules: [
				{
					name: "count-check",
					when: { "$aggregates.eventCount": { $gte: 1 } },
					then: [{ $set: { "status.active": true } }],
				},
			],
		});

		// Assert a fact at t=0
		session.assertFact("event", { value: 1 });
		session.tick(0);
		expect(session.getPath("$aggregates.eventCount")).toBe(1);
		expect(session.getPath("status.active")).toBe(true);

		// At t=4999 still within window
		session.tick(4999);
		expect(session.getPath("$aggregates.eventCount")).toBe(1);

		// At t=5001 fact is evicted
		session.tick(5001);
		expect(session.getPath("$aggregates.eventCount")).toBe(0);
	});

	it("non-windowed accumulators are unaffected by eviction", () => {
		const clock = createVirtualClock(0);
		const session = createSession({
			clock,
			factTypes: [{ name: "event", fields: { value: "number" } }],
			accumulates: [
				{ factType: "event", field: "value", fn: "$count", alias: "totalCount" },
				{ factType: "event", field: "value", fn: "$count", alias: "windowCount", window: 3000 },
			],
			rules: [],
		});

		session.assertFact("event", { value: 1 });
		session.tick(0);

		session.tick(4000);
		expect(session.getPath("$aggregates.totalCount")).toBe(1);
		expect(session.getPath("$aggregates.windowCount")).toBe(0);
	});
});
