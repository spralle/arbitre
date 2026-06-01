// ---------------------------------------------------------------------------
// Accumulate node — maintains running aggregates over typed facts (L2).
// ---------------------------------------------------------------------------

import type { CustomAccumulateFunction } from "./accumulate-functions.js";
import { COLLECT_FN_NAME, getAccumulateFn } from "./accumulate-functions.js";
import { matchesFact } from "./fact-match.js";
import type { Fact } from "./fact-memory.js";

export interface AccumulateConfig {
	readonly factType: string;
	readonly field: string;
	readonly fn: string;
	readonly alias: string;
	readonly filter?: Record<string, unknown> | undefined;
	/** For cross-type: binding name from a pattern rule to scope accumulation */
	readonly binding?: string | undefined;
	/** For cross-type: the rule name whose beta network provides tokens */
	readonly rule?: string | undefined;
	/** Time window in ms — only facts asserted within window contribute */
	readonly window?: number | undefined;
	/** Expression to evaluate per token in token-driven mode */
	readonly expr?: unknown | undefined;
}

export type AccumulateValue = number | null | readonly Record<string, unknown>[];

export interface AccumulateNode {
	readonly config: AccumulateConfig;
	readonly addFact: (fact: Fact) => void;
	readonly removeFact: (fact: Fact) => void;
	readonly getValue: () => AccumulateValue;
	readonly recompute: (facts: readonly Fact[]) => void;
	readonly reset: () => void;
	readonly getTrackedFactIds: () => readonly string[];
}

function extractValue(fact: Fact, field: string): number | undefined {
	const raw = fact.data[field];
	return typeof raw === "number" ? raw : undefined;
}

export function createAccumulateNode(
	config: AccumulateConfig,
	customFunctions?: Readonly<Record<string, CustomAccumulateFunction>>,
): AccumulateNode {
	if (config.fn === COLLECT_FN_NAME) {
		return createCollectNode(config);
	}

	const aggFn = getAccumulateFn(config.fn, customFunctions);
	const tracked = new Map<string, number>();
	const isCount = config.fn === "$count";
	const fnName = config.fn;
	let runningSum = 0;
	let runningCount = 0;

	const addFact = (fact: Fact): void => {
		if (!matchesFact(fact, config.factType, config.filter)) return;
		if (isCount) {
			tracked.set(fact.id, 0);
			runningCount++;
			return;
		}
		const value = extractValue(fact, config.field);
		if (value === undefined) return;
		tracked.set(fact.id, value);
		runningSum += value;
		runningCount++;
	};

	const removeFact = (fact: Fact): void => {
		const value = tracked.get(fact.id);
		if (value !== undefined) {
			tracked.delete(fact.id);
			runningSum -= value;
			runningCount--;
		}
	};

	const getValue = (): number | null => {
		switch (fnName) {
			case "$sum":
				return runningSum;
			case "$count":
				return runningCount;
			case "$avg":
				return runningCount === 0 ? null : runningSum / runningCount;
			default:
				return aggFn([...tracked.values()]);
		}
	};

	const recompute = (facts: readonly Fact[]): void => {
		tracked.clear();
		runningSum = 0;
		runningCount = 0;
		for (const fact of facts) {
			addFact(fact);
		}
	};

	const reset = (): void => {
		tracked.clear();
		runningSum = 0;
		runningCount = 0;
	};

	const getTrackedFactIds = (): readonly string[] => {
		return [...tracked.keys()];
	};

	return { config, addFact, removeFact, getValue, recompute, reset, getTrackedFactIds };
}

function createCollectNode(config: AccumulateConfig): AccumulateNode {
	const collected = new Map<string, Record<string, unknown>>();

	const addFact = (fact: Fact): void => {
		if (!matchesFact(fact, config.factType, config.filter)) return;
		collected.set(fact.id, fact.data);
	};

	const removeFact = (fact: Fact): void => {
		collected.delete(fact.id);
	};

	const getValue = (): readonly Record<string, unknown>[] => {
		return [...collected.values()];
	};

	const recompute = (facts: readonly Fact[]): void => {
		collected.clear();
		for (const fact of facts) {
			addFact(fact);
		}
	};

	const reset = (): void => {
		collected.clear();
	};

	const getTrackedFactIds = (): readonly string[] => {
		return [...collected.keys()];
	};

	return { config, addFact, removeFact, getValue, recompute, reset, getTrackedFactIds };
}
