import { compile } from "kuery/compile";
import { describe, expect, it } from "vitest";
import { createAgenda } from "../agenda.js";
import type { CompiledStage, OperatorFunction, ThenOperatorRegistry } from "../contracts.js";
import { createOperatorRegistry } from "../expression-operators.js";
import { createScopeManager } from "../scope.js";
import { type StageExecContext, executeStages, resolveValue } from "../stage-executor.js";

function makeCtx(
	initialState?: Record<string, unknown>,
	opts?: { thenOperators?: ThenOperatorRegistry; operators?: Record<string, (...args: unknown[]) => unknown> },
): StageExecContext {
	return {
		scope: createScopeManager(initialState),
		agenda: createAgenda(),
		thenOperators: opts?.thenOperators,
		operators: opts?.operators,
	};
}

function stage(operator: string, entries: Record<string, unknown>): CompiledStage {
	return { operator, entries: new Map(Object.entries(entries)) };
}

// ---------------------------------------------------------------------------
// $set
// ---------------------------------------------------------------------------

describe("$set operator", () => {
	it("should set a value at a path in scope", () => {
		const ctx = makeCtx();
		const changes = executeStages([stage("$set", { name: "Alice" })], "r1", ctx);
		expect(ctx.scope.get("name")).toBe("Alice");
		expect(changes).toHaveLength(1);
		expect(changes[0]).toMatchObject({ path: "name", previousValue: undefined, newValue: "Alice", ruleName: "r1" });
	});

	it("should overwrite an existing value", () => {
		const ctx = makeCtx({ name: "Bob" });
		const changes = executeStages([stage("$set", { name: "Alice" })], "r1", ctx);
		expect(changes[0]!.previousValue).toBe("Bob");
		expect(ctx.scope.get("name")).toBe("Alice");
	});

	it("should set namespaced paths", () => {
		const ctx = makeCtx();
		executeStages([stage("$set", { "$ui.panel.visible": true })], "r1", ctx);
		expect(ctx.scope.get("$ui.panel.visible")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// $unset
// ---------------------------------------------------------------------------

describe("$unset operator", () => {
	it("should remove a value from scope", () => {
		const ctx = makeCtx({ name: "Alice" });
		const changes = executeStages([stage("$unset", { name: true })], "r1", ctx);
		expect(ctx.scope.get("name")).toBeUndefined();
		expect(changes[0]!.previousValue).toBe("Alice");
		expect(changes[0]!.newValue).toBeUndefined();
	});

	it("should handle unsetting a non-existent path gracefully", () => {
		const ctx = makeCtx();
		const changes = executeStages([stage("$unset", { missing: true })], "r1", ctx);
		expect(changes).toHaveLength(1);
		expect(changes[0]!.previousValue).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// $inc
// ---------------------------------------------------------------------------

describe("$inc operator", () => {
	it("should increment an existing numeric value", () => {
		const ctx = makeCtx({ count: 5 });
		const changes = executeStages([stage("$inc", { count: 3 })], "r1", ctx);
		expect(ctx.scope.get("count")).toBe(8);
		expect(changes[0]!.previousValue).toBe(5);
		expect(changes[0]!.newValue).toBe(8);
	});

	it("should treat missing path as zero", () => {
		const ctx = makeCtx();
		executeStages([stage("$inc", { count: 1 })], "r1", ctx);
		expect(ctx.scope.get("count")).toBe(1);
	});

	it("should increment by negative values", () => {
		const ctx = makeCtx({ count: 10 });
		executeStages([stage("$inc", { count: -3 })], "r1", ctx);
		expect(ctx.scope.get("count")).toBe(7);
	});
});

// ---------------------------------------------------------------------------
// $push
// ---------------------------------------------------------------------------

describe("$push operator", () => {
	it("should push to an existing array", () => {
		const ctx = makeCtx({ items: [1, 2] });
		executeStages([stage("$push", { items: 3 })], "r1", ctx);
		expect(ctx.scope.get("items")).toEqual([1, 2, 3]);
	});

	it("should create an array when path is undefined", () => {
		const ctx = makeCtx();
		executeStages([stage("$push", { items: "hello" })], "r1", ctx);
		expect(ctx.scope.get("items")).toEqual(["hello"]);
	});
});

// ---------------------------------------------------------------------------
// $pull
// ---------------------------------------------------------------------------

describe("$pull operator", () => {
	it("should remove matching items from an array", () => {
		const ctx = makeCtx({ items: [{ id: 1 }, { id: 2 }, { id: 3 }] });
		const predicate = compile({ id: 2 });
		executeStages([{ operator: "$pull", entries: new Map([["items", predicate]]) }], "r1", ctx);
		expect(ctx.scope.get("items")).toEqual([{ id: 1 }, { id: 3 }]);
	});

	it("should leave array unchanged when no items match", () => {
		const ctx = makeCtx({ items: [{ id: 1 }] });
		const predicate = compile({ id: 99 });
		executeStages([{ operator: "$pull", entries: new Map([["items", predicate]]) }], "r1", ctx);
		expect(ctx.scope.get("items")).toEqual([{ id: 1 }]);
	});

	it("should skip non-array targets", () => {
		const ctx = makeCtx({ items: "not-array" });
		const predicate = compile({ id: 1 });
		const changes = executeStages([{ operator: "$pull", entries: new Map([["items", predicate]]) }], "r1", ctx);
		expect(changes).toHaveLength(0);
	});
});

// ---------------------------------------------------------------------------
// $merge
// ---------------------------------------------------------------------------

describe("$merge operator", () => {
	it("should deep merge objects", () => {
		const ctx = makeCtx({ config: { a: 1, b: 2 } });
		executeStages([stage("$merge", { config: { b: 3, c: 4 } })], "r1", ctx);
		const result = ctx.scope.get("config") as Record<string, unknown>;
		expect(result.a).toBe(1);
		expect(result.b).toBe(3);
		expect(result.c).toBe(4);
	});

	it("should set value when target is primitive", () => {
		const ctx = makeCtx({ config: "old" });
		executeStages([stage("$merge", { config: { a: 1 } })], "r1", ctx);
		const result = ctx.scope.get("config") as Record<string, unknown>;
		expect(result.a).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// $focus
// ---------------------------------------------------------------------------

describe("$focus operator", () => {
	it("should set the agenda focus group", () => {
		const ctx = makeCtx();
		const changes = executeStages([stage("$focus", { group: "validation" })], "r1", ctx);
		expect(changes).toHaveLength(0);
		// Focus is set on agenda — no state changes returned
	});
});

// ---------------------------------------------------------------------------
// Custom operators
// ---------------------------------------------------------------------------

describe("custom then operators", () => {
	it("should dispatch to registered custom operator", () => {
		const registry: ThenOperatorRegistry = {
			register: () => {},
			has: (name) => name === "$custom",
			get: (name) => {
				if (name === "$custom") {
					return (entries, _scope, write) => {
						for (const [path, value] of entries) {
							write(path, `custom:${value}`);
						}
					};
				}
				return undefined;
			},
		};
		const ctx = makeCtx({}, { thenOperators: registry });
		const changes = executeStages([stage("$custom", { result: "test" })], "r1", ctx);
		expect(ctx.scope.get("result")).toBe("custom:test");
		expect(changes).toHaveLength(1);
	});

	it("should throw when operator is unknown and no registry", () => {
		const ctx = makeCtx();
		expect(() => executeStages([stage("$unknown", { x: 1 })], "r1", ctx)).toThrow("Unknown then operator");
	});

	it("should throw when operator is not found in registry", () => {
		const registry: ThenOperatorRegistry = {
			register: () => {},
			has: () => false,
			get: () => undefined,
		};
		const ctx = makeCtx({}, { thenOperators: registry });
		expect(() => executeStages([stage("$notfound", { x: 1 })], "r1", ctx)).toThrow('Unknown then operator "$notfound"');
	});
});

// ---------------------------------------------------------------------------
// resolveValue
// ---------------------------------------------------------------------------

describe("resolveValue", () => {
	it("should resolve namespaced references from scope", () => {
		const scope = createScopeManager({ $state: { x: 42 } });
		scope.set("$state.x", 42, "test");
		const result = resolveValue("$$state.x", scope);
		expect(result).toBe(42);
	});

	it("should resolve plain binding references", () => {
		const scope = createScopeManager();
		scope.set("count", 10, "test");
		const result = resolveValue("$count", scope);
		expect(result).toBe(10);
	});

	it("should return literal values unchanged", () => {
		const scope = createScopeManager();
		expect(resolveValue(42, scope)).toBe(42);
		expect(resolveValue("hello", scope)).toBe("hello");
		expect(resolveValue(null, scope)).toBeNull();
	});
});

// ---------------------------------------------------------------------------
// evaluateExpression (via resolveValue)
// ---------------------------------------------------------------------------

describe("evaluateExpression", () => {
	const operators = createOperatorRegistry();

	it("should evaluate $sum expression", () => {
		const scope = createScopeManager();
		const result = resolveValue({ $sum: [1, 2, 3] }, scope, operators);
		expect(result).toBe(6);
	});

	it("should evaluate $multiply expression", () => {
		const scope = createScopeManager();
		const result = resolveValue({ $multiply: [2, 3, 4] }, scope, operators);
		expect(result).toBe(24);
	});

	it("should return null for $multiply with non-numeric args", () => {
		const scope = createScopeManager();
		const result = resolveValue({ $multiply: [2, "x"] }, scope, operators);
		expect(result).toBeNull();
	});

	it("should evaluate nested expressions", () => {
		const scope = createScopeManager();
		const result = resolveValue({ $sum: [{ $multiply: [2, 3] }, 4] }, scope, operators);
		expect(result).toBe(10);
	});

	it("should evaluate $multiply expression via custom operators", () => {
		const scope = createScopeManager();
		const result = resolveValue({ $multiply: [2, 3, 4] }, scope, operators);
		expect(result).toBe(24);
	});

	it("should return null for unknown expression without operators", () => {
		const scope = createScopeManager();
		const result = resolveValue({ $sum: [1, 2, 3] }, scope);
		expect(result).toBeNull();
	});

	it("should evaluate nested expressions", () => {
		const scope = createScopeManager();
		const result = resolveValue({ $sum: [{ $multiply: [2, 3] }, 4] }, scope, operators);
		expect(result).toBe(10);
	});

	it("should dispatch to custom expression operator from registry", () => {
		const scope = createScopeManager();
		const custom = {
			$double: ((args: readonly unknown[]) => (args[0] as number) * 2) as OperatorFunction,
		};
		const result = resolveValue({ $double: 5 }, scope, custom);
		expect(result).toBe(10);
	});
});
