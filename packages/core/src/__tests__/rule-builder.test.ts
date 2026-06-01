import { describe, expect, it } from "vitest";
import { defineRule } from "../rule-builder.js";

describe("defineRule builder", () => {
	it("creates a valid rule with all options", () => {
		const rule = defineRule("test-rule")
			.when({ x: { $eq: 1 } })
			.then([{ $set: { y: 2 } }])
			.salience(5)
			.description("test")
			.build();

		expect(rule.name).toBe("test-rule");
		expect(rule.salience).toBe(5);
		expect(rule.description).toBe("test");
	});

	it("throws if when is missing", () => {
		expect(() =>
			defineRule("no-when")
				.then([{ $set: { x: 1 } }])
				.build(),
		).toThrow("requires a when condition");
	});

	it("throws if then is missing", () => {
		expect(() =>
			defineRule("no-then")
				.when({ x: { $eq: 1 } })
				.build(),
		).toThrow("requires then actions");
	});

	it("supports chaining all options", () => {
		const rule = defineRule("full")
			.when({ a: { $eq: true } })
			.then([{ $set: { b: 1 } }])
			.else([{ $set: { b: 0 } }])
			.salience(10)
			.activationGroup("main")
			.onConflict("warn")
			.enabled(true)
			.expires(5000)
			.build();

		expect(rule.activationGroup).toBe("main");
		expect(rule.onConflict).toBe("warn");
		expect(rule.expires).toBe(5000);
	});
});
