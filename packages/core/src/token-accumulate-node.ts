// ---------------------------------------------------------------------------
// Token Accumulate Node — aggregates over beta join tokens using expressions.
// When a rule has `expr` set, values are computed by evaluating the expression
// against each token's fact bindings rather than extracting a single field.
// ---------------------------------------------------------------------------

import type { CustomAccumulateFunction } from "./accumulate-functions.js";
import { getAccumulateFn } from "./accumulate-functions.js";
import type { AccumulateConfig, AccumulateValue } from "./accumulate-node.js";
import type { Token } from "./beta-node.js";

export interface TokenAccumulateNode {
	readonly config: AccumulateConfig;
	readonly addToken: (token: Token) => void;
	readonly removeToken: (tokenId: string) => void;
	readonly getValue: () => AccumulateValue;
	readonly recompute: (tokens: readonly Token[]) => void;
	readonly reset: () => void;
	readonly getTrackedTokenIds: () => readonly string[];
}

/**
 * Resolve a binding reference like '$a.weight' from token fact bindings.
 */
function resolveTokenRef(ref: string, token: Token): unknown {
	if (!ref.startsWith("$")) return undefined;
	const path = ref.slice(1);
	const dotIndex = path.indexOf(".");
	if (dotIndex < 0) return undefined;
	const bindingName = path.slice(0, dotIndex);
	const fieldPath = path.slice(dotIndex + 1);
	const fact = token.factBindings[bindingName];
	if (!fact) return undefined;
	return resolvePath(fact.data, fieldPath);
}

function resolvePath(obj: Record<string, unknown>, path: string): unknown {
	const parts = path.split(".");
	let current: unknown = obj;
	for (const part of parts) {
		if (current == null || typeof current !== "object") return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}

/**
 * Evaluate an expression against a token's bindings.
 * Supports:
 * - String refs: '$binding.field'
 * - Numeric literals
 * - Objects with operator keys: { $subtract: [...], $add: [...], $multiply: [...] }
 */
export function evaluateTokenExpr(expr: unknown, token: Token): number | undefined {
	if (typeof expr === "number") return expr;
	if (typeof expr === "string") {
		const val = resolveTokenRef(expr, token);
		return typeof val === "number" ? val : undefined;
	}
	if (expr != null && typeof expr === "object" && !Array.isArray(expr)) {
		return evaluateOperator(expr as Record<string, unknown>, token);
	}
	return undefined;
}

function evaluateOperator(obj: Record<string, unknown>, token: Token): number | undefined {
	const keys = Object.keys(obj);
	if (keys.length !== 1) return undefined;
	const op = keys[0];
	const args = obj[op];
	if (!Array.isArray(args)) return undefined;

	const values = args.map((a) => evaluateTokenExpr(a, token));
	if (values.some((v) => v === undefined)) return undefined;
	const nums = values as number[];

	switch (op) {
		case "$subtract":
			return nums.length === 2 ? nums[0] - nums[1] : undefined;
		case "$add":
			return nums.reduce((a, b) => a + b, 0);
		case "$multiply":
			return nums.reduce((a, b) => a * b, 1);
		case "$divide":
			return nums.length === 2 && nums[1] !== 0 ? nums[0] / nums[1] : undefined;
		case "$abs":
			return nums.length === 1 ? Math.abs(nums[0]) : undefined;
		default:
			return undefined;
	}
}

function isTokenMode(config: AccumulateConfig): boolean {
	return config.rule !== undefined && config.expr !== undefined;
}

export function createTokenAccumulateNode(
	config: AccumulateConfig,
	customFunctions?: Readonly<Record<string, CustomAccumulateFunction>>,
): TokenAccumulateNode {
	if (!isTokenMode(config)) {
		throw new Error("TokenAccumulateNode requires both rule and expr in config");
	}

	const aggFn = getAccumulateFn(config.fn, customFunctions);
	const tracked = new Map<string, number>();
	const isCount = config.fn === "$count";

	const addToken = (token: Token): void => {
		if (isCount) {
			tracked.set(token.id, 1);
			return;
		}
		const value = evaluateTokenExpr(config.expr, token);
		if (value === undefined) return;
		tracked.set(token.id, value);
	};

	const removeToken = (tokenId: string): void => {
		tracked.delete(tokenId);
	};

	const getValue = (): AccumulateValue => {
		if (tracked.size === 0 && config.fn !== "$sum" && config.fn !== "$count") {
			return null;
		}
		return aggFn([...tracked.values()]);
	};

	const recompute = (tokens: readonly Token[]): void => {
		tracked.clear();
		for (const token of tokens) {
			addToken(token);
		}
	};

	const reset = (): void => {
		tracked.clear();
	};

	const getTrackedTokenIds = (): readonly string[] => {
		return [...tracked.keys()];
	};

	return { config, addToken, removeToken, getValue, recompute, reset, getTrackedTokenIds };
}
