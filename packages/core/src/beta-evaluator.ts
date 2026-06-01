import type { BetaNetwork } from "./beta-network.js";
import { compileBetaNetwork } from "./beta-network.js";
import type { Token } from "./beta-node.js";
import { matchesFilter } from "./fact-match.js";
import type { Fact } from "./fact-memory.js";
import type { FactPattern } from "./fact-pattern.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FactActivation {
	readonly ruleName: string;
	readonly tokens: readonly Token[];
}

export interface FactDeactivation {
	readonly ruleName: string;
	readonly removedTokens: readonly Token[];
}

export interface BetaEvaluator {
	readonly registerRule: (ruleName: string, patterns: readonly FactPattern[]) => void;
	readonly removeRule: (ruleName: string) => void;
	readonly onFactAsserted: (bindingName: string, factType: string, fact: Fact) => readonly FactActivation[];
	readonly onFactRetracted: (factId: string) => readonly FactDeactivation[];
	readonly getTokensForRule: (ruleName: string) => readonly Token[];
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface RuleEntry {
	readonly ruleName: string;
	readonly patterns: readonly FactPattern[];
	readonly network: BetaNetwork;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createBetaEvaluator(
	compile: (patterns: readonly FactPattern[]) => BetaNetwork = compileBetaNetwork,
): BetaEvaluator {
	const rules = new Map<string, RuleEntry>();
	// Index: factType → rule entries that care about that type
	const typeIndex = new Map<string, Set<string>>();

	const registerRule = (ruleName: string, patterns: readonly FactPattern[]): void => {
		const network = compile(patterns);
		const entry: RuleEntry = { ruleName, patterns, network };
		rules.set(ruleName, entry);

		for (const p of patterns) {
			let set = typeIndex.get(p.$fact);
			if (!set) {
				set = new Set();
				typeIndex.set(p.$fact, set);
			}
			set.add(ruleName);
		}
	};

	const removeRule = (ruleName: string): void => {
		const entry = rules.get(ruleName);
		if (!entry) return;
		for (const p of entry.patterns) {
			const set = typeIndex.get(p.$fact);
			if (set) {
				set.delete(ruleName);
				if (set.size === 0) typeIndex.delete(p.$fact);
			}
		}
		rules.delete(ruleName);
	};

	const onFactAsserted = (_bindingName: string, factType: string, fact: Fact): readonly FactActivation[] => {
		const ruleNames = typeIndex.get(factType);
		if (!ruleNames) return [];

		const activations: FactActivation[] = [];
		for (const ruleName of ruleNames) {
			const entry = rules.get(ruleName);
			if (!entry) continue;
			// Find all patterns matching this fact type (supports self-joins)
			const matchingPatterns = entry.patterns.filter((p) => p.$fact === factType);
			for (const pattern of matchingPatterns) {
				if (pattern.$where && !matchesFilter(fact.data, pattern.$where)) continue;
				const tokens = entry.network.activate(pattern.$bind, fact);
				if (tokens.length > 0) {
					activations.push({ ruleName, tokens });
				}
			}
		}
		return activations;
	};

	const onFactRetracted = (factId: string): readonly FactDeactivation[] => {
		const deactivations: FactDeactivation[] = [];
		for (const [ruleName, entry] of rules) {
			const removedTokens = entry.network.retract(factId);
			if (removedTokens.length > 0) {
				deactivations.push({ ruleName, removedTokens });
			}
		}
		return deactivations;
	};

	const getTokensForRule = (ruleName: string): readonly Token[] => {
		const entry = rules.get(ruleName);
		if (!entry) return [];
		return entry.network.getCompleteTokens();
	};

	return { registerRule, removeRule, onFactAsserted, onFactRetracted, getTokensForRule };
}
