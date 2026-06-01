// ---------------------------------------------------------------------------
// Cross-Type Accumulator — accumulates over beta join tokens.
// Only facts in complete tokens contribute to the aggregate.
// ---------------------------------------------------------------------------

import type { CustomAccumulateFunction } from "./accumulate-functions.js";
import { getAccumulateFn } from "./accumulate-functions.js";
import type { AccumulateConfig, AccumulateValue } from "./accumulate-node.js";
import type { Token } from "./beta-node.js";

export interface CrossTypeAccumulator {
	readonly onTokenCreated: (ruleName: string, token: Token) => void;
	readonly onTokenRemoved: (ruleName: string, token: Token) => void;
	readonly getValues: () => Readonly<Record<string, AccumulateValue>>;
}

function isCrossTypeConfig(config: AccumulateConfig): config is AccumulateConfig & { binding: string; rule: string } {
	return config.binding !== undefined && config.rule !== undefined;
}

function extractTokenValue(token: Token, binding: string, field: string, fn: string): number | undefined {
	if (fn === "$count") return 1;
	const fact = token.factBindings[binding];
	if (!fact) return undefined;
	const raw = fact.data[field];
	return typeof raw === "number" ? raw : undefined;
}

export function createCrossTypeAccumulator(
	configs: readonly AccumulateConfig[],
	customFunctions?: Readonly<Record<string, CustomAccumulateFunction>>,
): CrossTypeAccumulator {
	const crossConfigs = configs.filter(isCrossTypeConfig);

	// Per-config: track token contributions
	// Key: alias → Map<tokenId, value>
	const tokenMaps = new Map<string, Map<string, number>>();
	const fnMap = new Map<string, (values: readonly number[]) => number | null>();

	for (const cfg of crossConfigs) {
		tokenMaps.set(cfg.alias, new Map());
		fnMap.set(cfg.alias, getAccumulateFn(cfg.fn, customFunctions));
	}

	function onTokenCreated(ruleName: string, token: Token): void {
		for (const cfg of crossConfigs) {
			if (cfg.rule !== ruleName) continue;
			const value = extractTokenValue(token, cfg.binding, cfg.field, cfg.fn);
			if (value === undefined) continue;
			const map = tokenMaps.get(cfg.alias)!;
			map.set(token.id, value);
		}
	}

	function onTokenRemoved(ruleName: string, token: Token): void {
		for (const cfg of crossConfigs) {
			if (cfg.rule !== ruleName) continue;
			const map = tokenMaps.get(cfg.alias)!;
			map.delete(token.id);
		}
	}

	function getValues(): Readonly<Record<string, AccumulateValue>> {
		const result: Record<string, AccumulateValue> = {};
		for (const cfg of crossConfigs) {
			const map = tokenMaps.get(cfg.alias)!;
			const fn = fnMap.get(cfg.alias)!;
			result[cfg.alias] = fn([...map.values()]);
		}
		return result;
	}

	return { onTokenCreated, onTokenRemoved, getValues };
}
