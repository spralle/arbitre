import { describe, expect, it } from "vitest";
import { createAccumulateManager } from "../accumulate-manager.js";
import { createAccumulateNode } from "../accumulate-node.js";
import type { Fact } from "../fact-memory.js";

function makeFact(id: string, type: string, data: Record<string, unknown>): Fact {
	return { id, type, data, assertedAt: Date.now(), version: 1 };
}

describe("$collect accumulate function", () => {
	it("returns empty array when no facts match", () => {
		const node = createAccumulateNode({
			factType: "item",
			field: "",
			fn: "$collect",
			alias: "items",
		});
		expect(node.getValue()).toEqual([]);
	});

	it("collects fact data objects", () => {
		const node = createAccumulateNode({
			factType: "item",
			field: "",
			fn: "$collect",
			alias: "items",
		});

		node.addFact(makeFact("f1", "item", { name: "a", value: 1 }));
		node.addFact(makeFact("f2", "item", { name: "b", value: 2 }));
		node.addFact(makeFact("f3", "item", { name: "c", value: 3 }));

		const result = node.getValue() as Record<string, unknown>[];
		expect(result).toHaveLength(3);
		expect(result).toContainEqual({ name: "a", value: 1 });
		expect(result).toContainEqual({ name: "b", value: 2 });
		expect(result).toContainEqual({ name: "c", value: 3 });
	});

	it("removes fact data on retract", () => {
		const node = createAccumulateNode({
			factType: "item",
			field: "",
			fn: "$collect",
			alias: "items",
		});

		const f1 = makeFact("f1", "item", { name: "a" });
		const f2 = makeFact("f2", "item", { name: "b" });
		node.addFact(f1);
		node.addFact(f2);

		node.removeFact(f1);
		const result = node.getValue() as Record<string, unknown>[];
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({ name: "b" });
	});

	it("ignores facts of wrong type", () => {
		const node = createAccumulateNode({
			factType: "item",
			field: "",
			fn: "$collect",
			alias: "items",
		});

		node.addFact(makeFact("f1", "other", { name: "x" }));
		expect(node.getValue()).toEqual([]);
	});

	it("respects filter", () => {
		const node = createAccumulateNode({
			factType: "item",
			field: "",
			fn: "$collect",
			alias: "active",
			filter: { status: "active" },
		});

		node.addFact(makeFact("f1", "item", { name: "a", status: "active" }));
		node.addFact(makeFact("f2", "item", { name: "b", status: "inactive" }));

		const result = node.getValue() as Record<string, unknown>[];
		expect(result).toHaveLength(1);
		expect(result[0]).toEqual({ name: "a", status: "active" });
	});

	it("works reactively via manager", () => {
		const manager = createAccumulateManager([{ factType: "order", field: "", fn: "$collect", alias: "orders" }]);

		manager.onFactAsserted(makeFact("o1", "order", { total: 100 }));
		manager.onFactAsserted(makeFact("o2", "order", { total: 200 }));

		const agg1 = manager.getAggregates();
		expect(agg1.orders).toHaveLength(2);

		manager.onFactRetracted(makeFact("o1", "order", { total: 100 }));
		const agg2 = manager.getAggregates();
		expect(agg2.orders).toHaveLength(1);
	});

	it("recompute rebuilds collection from scratch", () => {
		const node = createAccumulateNode({
			factType: "item",
			field: "",
			fn: "$collect",
			alias: "items",
		});

		node.addFact(makeFact("f1", "item", { x: 1 }));
		node.recompute([makeFact("f2", "item", { x: 2 }), makeFact("f3", "item", { x: 3 })]);

		const result = node.getValue() as Record<string, unknown>[];
		expect(result).toHaveLength(2);
		expect(node.getTrackedFactIds()).toEqual(["f2", "f3"]);
	});

	it("reset clears collection", () => {
		const node = createAccumulateNode({
			factType: "item",
			field: "",
			fn: "$collect",
			alias: "items",
		});

		node.addFact(makeFact("f1", "item", { x: 1 }));
		node.reset();
		expect(node.getValue()).toEqual([]);
	});
});
