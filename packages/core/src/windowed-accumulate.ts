// ---------------------------------------------------------------------------
// Windowed accumulate node — time-bounded aggregation over facts.
// Only facts asserted within [now - window, now] contribute to the aggregate.
// ---------------------------------------------------------------------------

import type { CustomAccumulateFunction } from "./accumulate-functions.js";
import { COLLECT_FN_NAME, getAccumulateFn } from "./accumulate-functions.js";
import type { AccumulateConfig, AccumulateValue } from "./accumulate-node.js";
import { matchesFact } from "./fact-match.js";
import type { Fact } from "./fact-memory.js";

export interface WindowedAccumulateConfig extends AccumulateConfig {
	readonly window: number;
}

export interface WindowedAccumulateNode {
	readonly config: WindowedAccumulateConfig;
	readonly addFact: (fact: Fact, timestamp: number) => void;
	readonly removeFact: (fact: Fact) => void;
	/** Evict facts older than now - window. Returns true if any were evicted. */
	readonly evict: (now: number) => boolean;
	readonly getValue: () => AccumulateValue;
	readonly getTrackedFactIds: () => readonly string[];
}

interface TimestampedEntry {
	readonly fact: Fact;
	readonly timestamp: number;
}

function evictExpired(entries: Map<string, { timestamp: number }>, cutoff: number): boolean {
	let evicted = false;
	for (const [id, entry] of entries) {
		if (entry.timestamp < cutoff) {
			entries.delete(id);
			evicted = true;
		}
	}
	return evicted;
}

export function createWindowedAccumulateNode(
	config: WindowedAccumulateConfig,
	customFunctions?: Readonly<Record<string, CustomAccumulateFunction>>,
): WindowedAccumulateNode {
	const entries = new Map<string, TimestampedEntry>();

	if (config.fn === COLLECT_FN_NAME) {
		return createWindowedCollectNode(config, entries);
	}

	const aggFn = getAccumulateFn(config.fn, customFunctions);
	const isCount = config.fn === "$count";

	const addFact = (fact: Fact, timestamp: number): void => {
		if (!matchesFact(fact, config.factType, config.filter)) return;
		entries.set(fact.id, { fact, timestamp });
	};

	const removeFact = (fact: Fact): void => {
		entries.delete(fact.id);
	};

	const evict = (now: number): boolean => {
		return evictExpired(entries, now - config.window);
	};

	const getValue = (): number | null => {
		if (isCount) {
			return aggFn([...entries.values()].map(() => 0));
		}
		const values: number[] = [];
		for (const entry of entries.values()) {
			const raw = entry.fact.data[config.field];
			if (typeof raw === "number") values.push(raw);
		}
		return aggFn(values);
	};

	const getTrackedFactIds = (): readonly string[] => [...entries.keys()];

	return { config, addFact, removeFact, evict, getValue, getTrackedFactIds };
}

function createWindowedCollectNode(
	config: WindowedAccumulateConfig,
	entries: Map<string, TimestampedEntry>,
): WindowedAccumulateNode {
	const addFact = (fact: Fact, timestamp: number): void => {
		if (!matchesFact(fact, config.factType, config.filter)) return;
		entries.set(fact.id, { fact, timestamp });
	};

	const removeFact = (fact: Fact): void => {
		entries.delete(fact.id);
	};

	const evict = (now: number): boolean => {
		return evictExpired(entries, now - config.window);
	};

	const getValue = (): readonly Record<string, unknown>[] => {
		return [...entries.values()].map((e) => e.fact.data);
	};

	const getTrackedFactIds = (): readonly string[] => [...entries.keys()];

	return { config, addFact, removeFact, evict, getValue, getTrackedFactIds };
}
