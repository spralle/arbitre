/**
 * Temporal expression operators for time-aware rule conditions.
 * All operators read $meta.$now from scope and compare against timestamps.
 * Return false gracefully when required values are undefined.
 */

import type { OperatorFunction } from "./contracts.js";
import { isRecord } from "./type-guards.js";

function getNow(scope: Readonly<Record<string, unknown>>): number | undefined {
	const meta = scope["$meta"];
	if (meta != null && isRecord(meta)) {
		const now = meta["$now"];
		if (typeof now === "number") return now;
	}
	// Also check flat path form "$meta.$now"
	const flat = scope["$meta.$now"];
	if (typeof flat === "number") return flat;
	return undefined;
}

/**
 * $elapsed: true if now - args[0] > args[1]
 * Usage: { "$elapsed": ["$state.lastActivity", 30000] }
 * args[0] = resolved timestamp from path, args[1] = threshold in ms
 */
const $elapsed: OperatorFunction = (args, scope) => {
	const now = getNow(scope);
	if (now === undefined) return false;
	const [timestamp, threshold] = args;
	if (typeof timestamp !== "number" || typeof threshold !== "number") return false;
	return now - timestamp > threshold;
};

/**
 * $within: true if now - args[0] < args[1]
 * Usage: { "$within": ["$state.lastActivity", 30000] }
 * args[0] = resolved timestamp from path, args[1] = window in ms
 */
const $within: OperatorFunction = (args, scope) => {
	const now = getNow(scope);
	if (now === undefined) return false;
	const [timestamp, window] = args;
	if (typeof timestamp !== "number" || typeof window !== "number") return false;
	return now - timestamp < window;
};

/**
 * $after: true if now > args[0]
 * Usage: { "$after": 1700000000000 }
 */
const $after: OperatorFunction = (args, scope) => {
	const now = getNow(scope);
	if (now === undefined) return false;
	const timestamp = args[0];
	if (typeof timestamp !== "number") return false;
	return now > timestamp;
};

/**
 * $before: true if now < args[0]
 * Usage: { "$before": 1700000000000 }
 */
const $before: OperatorFunction = (args, scope) => {
	const now = getNow(scope);
	if (now === undefined) return false;
	const timestamp = args[0];
	if (typeof timestamp !== "number") return false;
	return now < timestamp;
};

/** All temporal operators as a registry map. */
export const TEMPORAL_OPERATORS: Readonly<Record<string, OperatorFunction>> = {
	$elapsed,
	$within,
	$after,
	$before,
};
