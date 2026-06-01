// ---------------------------------------------------------------------------
// Pure aggregate functions for accumulate nodes (L2 infrastructure).
// ---------------------------------------------------------------------------

import { ArbiterError, ArbiterErrorCode } from "./errors.js";

export type AccumulateFn = (values: readonly number[]) => number | null;

export const accumulateSum: AccumulateFn = (values) => {
	let total = 0;
	for (const v of values) {
		total += v;
	}
	return total;
};

export const accumulateCount: AccumulateFn = (values) => values.length;

export const accumulateMin: AccumulateFn = (values) => {
	if (values.length === 0) return null;
	return Math.min(...values);
};

export const accumulateMax: AccumulateFn = (values) => {
	if (values.length === 0) return null;
	return Math.max(...values);
};

export const accumulateAvg: AccumulateFn = (values) => {
	if (values.length === 0) return null;
	let total = 0;
	for (const v of values) {
		total += v;
	}
	return total / values.length;
};

export const ACCUMULATE_FUNCTIONS: Readonly<Record<string, AccumulateFn>> = {
	$sum: accumulateSum,
	$count: accumulateCount,
	$min: accumulateMin,
	$max: accumulateMax,
	$avg: accumulateAvg,
};

/** Sentinel indicating the $collect function (handled specially by the node). */
export const COLLECT_FN_NAME = "$collect";

/**
 * Custom accumulate function registration interface.
 * Users provide a factory that returns an AccumulateFn.
 */
export interface CustomAccumulateFunction {
	/** The accumulate function implementation */
	readonly fn: AccumulateFn;
}

export function getAccumulateFn(
	name: string,
	customFunctions?: Readonly<Record<string, CustomAccumulateFunction>>,
): AccumulateFn {
	const builtIn = ACCUMULATE_FUNCTIONS[name];
	if (builtIn) return builtIn;

	if (customFunctions) {
		const custom = customFunctions[name];
		if (custom) return custom.fn;
	}

	const available = Object.keys(ACCUMULATE_FUNCTIONS);
	if (customFunctions) {
		available.push(...Object.keys(customFunctions));
	}

	throw new ArbiterError(
		ArbiterErrorCode.INVALID_OPERATOR,
		`Unknown accumulate function: "${name}". Available functions: ${available.join(", ")}`,
		{ details: { name, available } },
	);
}
