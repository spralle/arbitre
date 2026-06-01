import { describe, expect, it } from "vitest";
import type { AccumulateConfig } from "../accumulate-node.js";
import { validateAccumulateConfigs } from "../validate-accumulate.js";

function validConfig(overrides?: Partial<AccumulateConfig>): AccumulateConfig {
	return { factType: "Order", fn: "$count", alias: "orderCount", ...overrides } as AccumulateConfig;
}

describe("validateAccumulateConfigs", () => {
	it("should pass for a valid $count config", () => {
		expect(() => validateAccumulateConfigs([validConfig()], "test-rule")).not.toThrow();
	});

	it("should pass for valid $sum config with field", () => {
		expect(() =>
			validateAccumulateConfigs([validConfig({ fn: "$sum", field: "amount", alias: "total" })], "test-rule"),
		).not.toThrow();
	});

	it("should reject missing factType", () => {
		const config = { fn: "$count", alias: "x" } as unknown as AccumulateConfig;
		expect(() => validateAccumulateConfigs([config], "test-rule")).toThrow("factType must be a non-empty string");
	});

	it("should reject empty factType", () => {
		const config = { factType: "", fn: "$count", alias: "x" } as unknown as AccumulateConfig;
		expect(() => validateAccumulateConfigs([config], "test-rule")).toThrow("factType must be a non-empty string");
	});

	it("should reject invalid function name", () => {
		const config = validConfig({ fn: "$invalid" as AccumulateConfig["fn"] });
		expect(() => validateAccumulateConfigs([config], "test-rule")).toThrow("fn must be one of");
	});

	it("should reject missing fn field", () => {
		const config = { factType: "Order", alias: "x" } as unknown as AccumulateConfig;
		expect(() => validateAccumulateConfigs([config], "test-rule")).toThrow("fn must be one of");
	});

	it("should reject missing alias", () => {
		const config = { factType: "Order", fn: "$count" } as unknown as AccumulateConfig;
		expect(() => validateAccumulateConfigs([config], "test-rule")).toThrow("alias must be a non-empty string");
	});

	it("should reject $sum without field", () => {
		const config = { factType: "Order", fn: "$sum", alias: "total" } as unknown as AccumulateConfig;
		expect(() => validateAccumulateConfigs([config], "test-rule")).toThrow('field is required for fn "$sum"');
	});

	it("should reject $avg without field", () => {
		const config = { factType: "Order", fn: "$avg", alias: "average" } as unknown as AccumulateConfig;
		expect(() => validateAccumulateConfigs([config], "test-rule")).toThrow('field is required for fn "$avg"');
	});

	it("should reject $min without field", () => {
		const config = { factType: "Order", fn: "$min", alias: "minimum" } as unknown as AccumulateConfig;
		expect(() => validateAccumulateConfigs([config], "test-rule")).toThrow('field is required for fn "$min"');
	});

	it("should reject duplicate aliases", () => {
		const configs = [validConfig({ alias: "dup" }), validConfig({ fn: "$collect", alias: "dup" })];
		expect(() => validateAccumulateConfigs(configs, "test-rule")).toThrow('duplicate alias "dup"');
	});

	it("should pass valid cross-type config with multiple entries", () => {
		const configs: AccumulateConfig[] = [
			validConfig({ factType: "Order", fn: "$count", alias: "orderCount" }),
			validConfig({ factType: "Payment", fn: "$sum", field: "amount", alias: "totalPaid" }),
		];
		expect(() => validateAccumulateConfigs(configs, "test-rule")).not.toThrow();
	});

	it("should pass valid $collect without field", () => {
		expect(() => validateAccumulateConfigs([validConfig({ fn: "$collect", alias: "all" })], "test-rule")).not.toThrow();
	});

	it("should accept custom function names when provided", () => {
		const config = validConfig({ fn: "$median" as AccumulateConfig["fn"], alias: "med" });
		const customFns = new Set(["$median"]);
		expect(() => validateAccumulateConfigs([config], "test-rule", customFns)).not.toThrow();
	});

	it("should reject unknown function names not in custom set", () => {
		const config = validConfig({ fn: "$median" as AccumulateConfig["fn"], alias: "med" });
		expect(() => validateAccumulateConfigs([config], "test-rule")).toThrow("fn must be one of");
	});
});
