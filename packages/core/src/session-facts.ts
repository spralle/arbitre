import type { Token } from "./beta-node.js";
import type { CompiledRule } from "./contracts.js";
import type { Fact } from "./fact-memory.js";
import type { ScopeManager } from "./scope.js";
import { isRecord } from "./type-guards.js";

// ---------------------------------------------------------------------------
// Types for dependency injection from the session
// ---------------------------------------------------------------------------

export interface FactSessionDeps {
	readonly assertNotDisposed: () => void;
	readonly factRegistry:
		| { validate(type: string, data: Readonly<Record<string, unknown>>): readonly string[] }
		| undefined;
	readonly factMemory:
		| {
				assertFact(type: string, data: Readonly<Record<string, unknown>>): string;
				getFact(id: string): Fact | undefined;
				retractFact(id: string): Fact | undefined;
				getFactsByType(type: string): readonly Fact[];
		  }
		| undefined;
	readonly accumulateManager: { onFactAsserted(fact: Fact): void; onFactRetracted(fact: Fact): void } | undefined;
	readonly crossTypeAccumulator:
		| { onTokenCreated(ruleName: string, token: Token): void; onTokenRemoved(ruleName: string, token: Token): void }
		| undefined;
	readonly betaEvaluator: {
		onFactAsserted(
			factType: string,
			bindingType: string,
			fact: Fact,
		): readonly { ruleName: string; tokens: readonly Token[] }[];
		onFactRetracted(factId: string): readonly { ruleName: string; removedTokens: readonly Token[] }[];
		getTokensForRule(ruleName: string): readonly Token[];
	};
	readonly scope: ScopeManager;
	readonly compiledRules: Map<string, CompiledRule>;
	readonly agenda: { addActivation(rule: CompiledRule): void; removeActivation(name: string): void };
	readonly tms: {
		ruleActivated(rule: CompiledRule): void;
		recordFactDependency(ruleName: string, factIds: string[]): void;
		retractByFact(id: string, scope: unknown): void;
	};
	readonly pendingTokens: Map<string, Token>;
	readonly syncAggregates: () => void;
	readonly evaluateCondition: (rule: CompiledRule, scope: ScopeManager) => boolean;
	readonly autoFire: boolean;
	readonly fire: () => unknown;
}

export function hasScopeConditions(rule: CompiledRule): boolean {
	const when = rule.source.when;
	if (!when || (isRecord(when) && "$always" in when)) return false;
	return isRecord(when) && Object.keys(when).length > 0;
}

export function createAssertFact(
	deps: FactSessionDeps,
): (type: string, data: Readonly<Record<string, unknown>>) => string {
	return (type, data) => {
		deps.assertNotDisposed();
		if (!deps.factRegistry || !deps.factMemory) {
			throw new Error("Fact support not configured. Provide factTypes in SessionConfig.");
		}
		const errors = deps.factRegistry.validate(type, data);
		if (errors.length > 0) {
			throw new Error(`Fact validation failed: ${errors.join("; ")}`);
		}
		const factId = deps.factMemory.assertFact(type, data);
		let aggregatesUpdated = false;
		if (deps.accumulateManager) {
			const fact = deps.factMemory.getFact(factId);
			if (fact) {
				deps.accumulateManager.onFactAsserted(fact);
				deps.syncAggregates();
				aggregatesUpdated = true;
			}
		}
		const fact = deps.factMemory.getFact(factId);
		if (fact) {
			processFactActivations(deps, fact, type);
		}
		if (deps.crossTypeAccumulator) {
			deps.syncAggregates();
			aggregatesUpdated = true;
		}
		if (aggregatesUpdated && deps.autoFire) deps.fire();
		return factId;
	};
}

function processFactActivations(deps: FactSessionDeps, fact: Fact, type: string): void {
	const activations = deps.betaEvaluator.onFactAsserted(type, type, fact);
	for (const activation of activations) {
		const compiled = deps.compiledRules.get(activation.ruleName);
		if (!compiled) continue;
		if (deps.crossTypeAccumulator) {
			for (const token of activation.tokens) {
				deps.crossTypeAccumulator.onTokenCreated(activation.ruleName, token);
			}
		}
		if (hasScopeConditions(compiled)) {
			const conditionMet = deps.evaluateCondition(compiled, deps.scope);
			if (!conditionMet) continue;
		}
		deps.agenda.addActivation(compiled);
		deps.tms.ruleActivated(compiled);
		const factIds: string[] = [];
		for (const token of activation.tokens) {
			for (const f of Object.values(token.factBindings)) {
				if (!factIds.includes(f.id)) factIds.push(f.id);
			}
		}
		if (factIds.length > 0) {
			deps.tms.recordFactDependency(compiled.name, factIds);
		}
		const latestToken = activation.tokens[activation.tokens.length - 1];
		if (latestToken) {
			deps.pendingTokens.set(activation.ruleName, latestToken);
		}
	}
}

export function createRetractFact(deps: FactSessionDeps): (id: string) => boolean {
	return (id) => {
		deps.assertNotDisposed();
		if (!deps.factMemory) {
			throw new Error("Fact support not configured. Provide factTypes in SessionConfig.");
		}
		const fact = deps.factMemory.getFact(id);
		const removed = deps.factMemory.retractFact(id) !== undefined;
		let aggregatesUpdated = false;
		if (removed && deps.accumulateManager && fact) {
			deps.accumulateManager.onFactRetracted(fact);
			deps.syncAggregates();
			aggregatesUpdated = true;
		}
		if (removed) {
			const deactivations = deps.betaEvaluator.onFactRetracted(id);
			for (const deactivation of deactivations) {
				if (deps.crossTypeAccumulator) {
					for (const token of deactivation.removedTokens) {
						deps.crossTypeAccumulator.onTokenRemoved(deactivation.ruleName, token);
					}
				}
				const tokens = deps.betaEvaluator.getTokensForRule(deactivation.ruleName);
				if (tokens.length === 0) {
					deps.agenda.removeActivation(deactivation.ruleName);
				}
			}
			deps.tms.retractByFact(id, deps.scope);
			if (deps.crossTypeAccumulator) {
				deps.syncAggregates();
			}
		}
		if (aggregatesUpdated && deps.autoFire) deps.fire();
		return removed;
	};
}

export function createGetFacts(deps: FactSessionDeps): (type: string) => readonly Fact[] {
	return (type) => {
		deps.assertNotDisposed();
		if (!deps.factMemory) {
			throw new Error("Fact support not configured. Provide factTypes in SessionConfig.");
		}
		return deps.factMemory.getFactsByType(type);
	};
}
