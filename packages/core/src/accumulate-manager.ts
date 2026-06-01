// ---------------------------------------------------------------------------
// AccumulateManager — routes facts to accumulate nodes, exposes aggregate values.
// Supports both regular and time-windowed accumulate nodes.
// ---------------------------------------------------------------------------

import type { CustomAccumulateFunction } from "./accumulate-functions.js";
import type { AccumulateConfig, AccumulateNode, AccumulateValue } from "./accumulate-node.js";
import { createAccumulateNode } from "./accumulate-node.js";
import type { ArbiterClock } from "./clock.js";
import type { Fact } from "./fact-memory.js";
import type { WindowedAccumulateConfig, WindowedAccumulateNode } from "./windowed-accumulate.js";
import { createWindowedAccumulateNode } from "./windowed-accumulate.js";

function isWindowed(config: AccumulateConfig): config is WindowedAccumulateConfig {
	return config.window !== undefined && config.window > 0;
}

export interface AccumulateManager {
	readonly onFactAsserted: (fact: Fact) => void;
	readonly onFactRetracted: (fact: Fact) => void;
	readonly getAggregates: () => Readonly<Record<string, AccumulateValue>>;
	readonly addConfig: (config: AccumulateConfig) => void;
	/** Evict stale facts from all windowed nodes. Returns true if any evicted. */
	readonly evict: (now: number) => boolean;
}

export function createAccumulateManager(
	configs: readonly AccumulateConfig[],
	customFunctions?: Readonly<Record<string, CustomAccumulateFunction>>,
	clock?: ArbiterClock,
): AccumulateManager {
	const nodes: AccumulateNode[] = [];
	const windowedNodes: WindowedAccumulateNode[] = [];
	const aliasSet = new Set<string>();

	for (const c of configs) {
		addConfigInternal(c);
	}

	function addConfigInternal(config: AccumulateConfig): void {
		if (aliasSet.has(config.alias)) return;
		aliasSet.add(config.alias);
		if (isWindowed(config)) {
			windowedNodes.push(createWindowedAccumulateNode(config, customFunctions));
		} else {
			nodes.push(createAccumulateNode(config, customFunctions));
		}
	}

	function onFactAsserted(fact: Fact): void {
		for (const node of nodes) {
			node.addFact(fact);
		}
		const timestamp = clock ? clock.now() : Date.now();
		for (const wNode of windowedNodes) {
			wNode.addFact(fact, timestamp);
		}
	}

	function onFactRetracted(fact: Fact): void {
		for (const node of nodes) {
			node.removeFact(fact);
		}
		for (const wNode of windowedNodes) {
			wNode.removeFact(fact);
		}
	}

	function getAggregates(): Readonly<Record<string, AccumulateValue>> {
		const result: Record<string, AccumulateValue> = {};
		for (const node of nodes) {
			result[node.config.alias] = node.getValue();
		}
		for (const wNode of windowedNodes) {
			result[wNode.config.alias] = wNode.getValue();
		}
		return result;
	}

	function addConfig(config: AccumulateConfig): void {
		addConfigInternal(config);
	}

	function evict(now: number): boolean {
		let anyEvicted = false;
		for (const wNode of windowedNodes) {
			if (wNode.evict(now)) anyEvicted = true;
		}
		return anyEvicted;
	}

	return { onFactAsserted, onFactRetracted, getAggregates, addConfig, evict };
}
