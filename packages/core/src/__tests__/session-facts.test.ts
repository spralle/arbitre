import { describe, expect, it } from "vitest";
import type { FactTypeDefinition } from "../fact-registry.js";
import { createSession } from "../session.js";

const OrderType: FactTypeDefinition = {
	name: "Order",
	fields: { amount: "number", customer: "string" },
};

describe("session fact support", () => {
	it("creates session with factTypes and asserts a fact", () => {
		const session = createSession({ factTypes: [OrderType] });
		const id = session.assertFact("Order", { amount: 100, customer: "Alice" });
		expect(typeof id).toBe("string");
		const facts = session.getFacts("Order");
		expect(facts).toHaveLength(1);
		expect(facts[0].data).toEqual({ amount: 100, customer: "Alice" });
	});

	it("retractFact removes the fact", () => {
		const session = createSession({ factTypes: [OrderType] });
		const id = session.assertFact("Order", { amount: 50, customer: "Bob" });
		expect(session.retractFact(id)).toBe(true);
		expect(session.getFacts("Order")).toHaveLength(0);
	});

	it("retractFact returns false for unknown id", () => {
		const session = createSession({ factTypes: [OrderType] });
		expect(session.retractFact("fact-999")).toBe(false);
	});

	it("getFacts returns only matching type", () => {
		const ItemType: FactTypeDefinition = { name: "Item", fields: { sku: "string" } };
		const session = createSession({ factTypes: [OrderType, ItemType] });
		session.assertFact("Order", { amount: 10, customer: "C" });
		session.assertFact("Item", { sku: "ABC" });
		expect(session.getFacts("Order")).toHaveLength(1);
		expect(session.getFacts("Item")).toHaveLength(1);
	});

	it("throws on invalid fact data", () => {
		const session = createSession({ factTypes: [OrderType] });
		expect(() => session.assertFact("Order", { amount: "not a number", customer: "X" })).toThrow(
			/Fact validation failed/,
		);
	});

	it("throws on unknown fact type", () => {
		const session = createSession({ factTypes: [OrderType] });
		expect(() => session.assertFact("Unknown", { foo: "bar" })).toThrow(/Unknown fact type/);
	});

	it("session without factTypes still works normally", () => {
		const session = createSession();
		session.assert("x", 1);
		expect(session.getPath("x")).toBe(1);
	});

	it("throws when using fact methods without factTypes configured", () => {
		const session = createSession();
		expect(() => session.assertFact("Order", {})).toThrow(/Fact support not configured/);
		expect(() => session.retractFact("fact-0")).toThrow(/Fact support not configured/);
		expect(() => session.getFacts("Order")).toThrow(/Fact support not configured/);
	});
});
