// ---------------------------------------------------------------------------
// Token Accumulate Manager — manages TokenAccumulateNode instances and
// integrates them with the session lifecycle (token events, aggregates).
// ---------------------------------------------------------------------------

import type { CustomAccumulateFunction } from "./accumulate-functions.js";
import type { AccumulateConfig, AccumulateValue } from "./accumulate-node.js";
import type { Token } from "./beta-node.js";
import type { TokenAccumulateNode } from "./token-accumulate-node.js";
import { createTokenAccumulateNode } from "./token-accumulate-node.js";

export interface TokenAccumulateManager {
	readonly onTokenCreated: (ruleName: string, token: Token) => void;
	readonly onTokenRemoved: (ruleName: string, token: Token) => void;
	readonly getValues: () => Readonly<Record<string, AccumulateValue>>;
	readonly recomputeForRule: (ruleName: string, tokens: readonly Token[]) => void;
	readonly hasNodes: () => boolean;
}

function isTokenAccumulateConfig(config: AccumulateConfig): boolean {
	return config.rule !== undefined && config.expr !== undefined;
}

export function createTokenAccumulateManager(
	configs: readonly AccumulateConfig[],
	customFunctions?: Readonly<Record<string, CustomAccumulateFunction>>,
): TokenAccumulateManager {
	const tokenConfigs = configs.filter(isTokenAccumulateConfig);
	const nodes: TokenAccumulateNode[] = tokenConfigs.map((c) => createTokenAccumulateNode(c, customFunctions));

	// Index by rule name for fast lookup
	const byRule = new Map<string, TokenAccumulateNode[]>();
	for (const node of nodes) {
		const rule = node.config.rule!;
		const list = byRule.get(rule) ?? [];
		list.push(node);
		byRule.set(rule, list);
	}

	const onTokenCreated = (ruleName: string, token: Token): void => {
		const ruleNodes = byRule.get(ruleName);
		if (!ruleNodes) return;
		for (const node of ruleNodes) {
			node.addToken(token);
		}
	};

	const onTokenRemoved = (ruleName: string, token: Token): void => {
		const ruleNodes = byRule.get(ruleName);
		if (!ruleNodes) return;
		for (const node of ruleNodes) {
			node.removeToken(token.id);
		}
	};

	const getValues = (): Readonly<Record<string, AccumulateValue>> => {
		const result: Record<string, AccumulateValue> = {};
		for (const node of nodes) {
			result[node.config.alias] = node.getValue();
		}
		return result;
	};

	const recomputeForRule = (ruleName: string, tokens: readonly Token[]): void => {
		const ruleNodes = byRule.get(ruleName);
		if (!ruleNodes) return;
		for (const node of ruleNodes) {
			node.recompute(tokens);
		}
	};

	const hasNodes = (): boolean => nodes.length > 0;

	return { onTokenCreated, onTokenRemoved, getValues, recomputeForRule, hasNodes };
}
