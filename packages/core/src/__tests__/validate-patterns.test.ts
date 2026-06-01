import { describe, expect, it } from "vitest";
import type { FactPattern } from "../fact-pattern.js";
import { validatePatterns } from "../validate-patterns.js";

function validPattern(overrides?: Partial<FactPattern>): FactPattern {
	return { $fact: "Order", $bind: "o", ...overrides };
}

describe("validatePatterns", () => {
	it("should pass for a valid pattern", () => {
		expect(() => validatePatterns([validPattern()], "test-rule")).not.toThrow();
	});

	it("should pass for valid pattern with $where field", () => {
		expect(() => validatePatterns([validPattern({ $where: { status: "active" } })], "test-rule")).not.toThrow();
	});

	it("should pass for valid pattern with $bind field", () => {
		const patterns: FactPattern[] = [
			{ $fact: "Order", $bind: "order" },
			{ $fact: "Item", $bind: "item", $join: { orderId: "$order.id" } },
		];
		expect(() => validatePatterns(patterns, "test-rule")).not.toThrow();
	});

	it("should reject pattern without $fact field", () => {
		const pattern = { $bind: "o" } as unknown as FactPattern;
		expect(() => validatePatterns([pattern], "test-rule")).toThrow('must have a non-empty "$fact" string');
	});

	it("should reject pattern with empty $fact", () => {
		const pattern = { $fact: "", $bind: "o" } as unknown as FactPattern;
		expect(() => validatePatterns([pattern], "test-rule")).toThrow('must have a non-empty "$fact" string');
	});

	it("should reject pattern without $bind field", () => {
		const pattern = { $fact: "Order" } as unknown as FactPattern;
		expect(() => validatePatterns([pattern], "test-rule")).toThrow('must have a non-empty "$bind" string');
	});

	it("should reject invalid $where shape (array)", () => {
		const pattern = { $fact: "Order", $bind: "o", $where: [1, 2] } as unknown as FactPattern;
		expect(() => validatePatterns([pattern], "test-rule")).toThrow("$where must be a non-null object");
	});

	it("should reject invalid $where shape (null)", () => {
		const pattern = { $fact: "Order", $bind: "o", $where: null } as unknown as FactPattern;
		expect(() => validatePatterns([pattern], "test-rule")).toThrow("$where must be a non-null object");
	});

	it("should reject invalid $join shape (array)", () => {
		const pattern = { $fact: "Order", $bind: "o", $join: [] } as unknown as FactPattern;
		expect(() => validatePatterns([pattern], "test-rule")).toThrow("$join must be a non-null object");
	});

	it("should reject $join referencing unknown binding", () => {
		const pattern: FactPattern = { $fact: "Item", $bind: "item", $join: { orderId: "$unknown.id" } };
		expect(() => validatePatterns([pattern], "test-rule")).toThrow('references unknown binding "unknown"');
	});

	it("should reject $join with non-$ reference value", () => {
		const patterns: FactPattern[] = [
			{ $fact: "Order", $bind: "order" },
			{ $fact: "Item", $bind: "item", $join: { orderId: "plainValue" } },
		];
		expect(() => validatePatterns(patterns, "test-rule")).toThrow('must be a "$binding.path" reference');
	});

	it("should reject duplicate $bind names", () => {
		const patterns: FactPattern[] = [
			{ $fact: "Order", $bind: "o" },
			{ $fact: "Item", $bind: "o" },
		];
		expect(() => validatePatterns(patterns, "test-rule")).toThrow('duplicate $bind name "o"');
	});

	it("should reject non-object pattern", () => {
		expect(() => validatePatterns(["not-an-object" as unknown as FactPattern], "test-rule")).toThrow(
			"must be an object",
		);
	});

	it("should pass multiple patterns with valid cross-references", () => {
		const patterns: FactPattern[] = [
			{ $fact: "Customer", $bind: "c" },
			{ $fact: "Order", $bind: "o", $join: { customerId: "$c.id" } },
			{ $fact: "Item", $bind: "i", $join: { orderId: "$o.id" } },
		];
		expect(() => validatePatterns(patterns, "test-rule")).not.toThrow();
	});
});
