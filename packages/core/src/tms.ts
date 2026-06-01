import type { CompiledRule, TmsConfig } from "./contracts.js";
import type { ScopeManager } from "./scope.js";

// ---------------------------------------------------------------------------
// Truth Maintenance System (ADR §5)
// Auto-retracts rule writes when conditions flip true→false.
// Extended: tracks fact-dependent derivations for join retraction.
//
// TMS modes:
// - "all" (default): auto-retracts ALL paths written by a rule when its condition becomes false
// - "namespaces": only auto-retracts writes to namespaces with autoRetract: true
// - "none": never auto-retract (user handles manually via else or external logic)
// ---------------------------------------------------------------------------

/** Provenance record linking a rule's writes to contributing fact IDs */
export interface TmsProvenance {
	readonly ruleName: string;
	readonly factIds: readonly string[];
}

export interface TruthMaintenanceSystem {
	readonly ruleActivated: (rule: CompiledRule) => void;
	readonly ruleDeactivated: (rule: CompiledRule, scope: ScopeManager) => readonly string[];
	readonly shouldTrack: (rule: CompiledRule) => boolean;
	readonly shouldAutoRetract: (path: string) => boolean;
	readonly getActiveRules: () => ReadonlySet<string>;
	readonly removeRule: (ruleName: string) => void;
	/** Register that a rule fired due to specific fact IDs */
	readonly recordFactDependency: (ruleName: string, factIds: readonly string[]) => void;
	/** Retract writes from rules that depended on a given fact ID */
	readonly retractByFact: (factId: string, scope: ScopeManager) => readonly string[];
	/** Get provenance records for a rule */
	readonly getProvenance: (ruleName: string) => readonly TmsProvenance[];
}

export function createTms(config?: TmsConfig, autoRetractNamespaces?: ReadonlySet<string>): TruthMaintenanceSystem {
	const activeRules = new Set<string>();
	const mode = config?.autoRetract ?? "all";
	// Fact dependency tracking: ruleName → factIds that contributed to its firing
	const factDependencies = new Map<string, Set<string>>();
	// Reverse index: factId → ruleNames that depend on it
	const factToRules = new Map<string, Set<string>>();

	function shouldAutoRetract(path: string): boolean {
		if (mode === "all") return true;
		if (mode === "none") return false;
		// mode === "namespaces" — check if path is in an auto-retract namespace
		if (!autoRetractNamespaces) return false;
		for (const ns of autoRetractNamespaces) {
			if (path === ns || path.startsWith(`${ns}.`)) return true;
		}
		return false;
	}

	function shouldTrack(rule: CompiledRule): boolean {
		return rule.hasTms !== false;
	}

	function ruleActivated(rule: CompiledRule): void {
		if (!shouldTrack(rule)) return;
		activeRules.add(rule.name);
	}

	function ruleDeactivated(rule: CompiledRule, scope: ScopeManager): readonly string[] {
		if (!shouldTrack(rule)) return [];
		if (!activeRules.has(rule.name)) return [];

		activeRules.delete(rule.name);

		const writes = scope.getWriteRecords(rule.name);
		const hasRetractable = writes.some((w) => shouldAutoRetract(w.path));
		if (!hasRetractable) return [];

		return scope.revertRule(rule.name);
	}

	function getActiveRules(): ReadonlySet<string> {
		return activeRules;
	}

	function removeRule(ruleName: string): void {
		activeRules.delete(ruleName);
		clearFactDependencies(ruleName);
	}

	function recordFactDependency(ruleName: string, factIds: readonly string[]): void {
		let deps = factDependencies.get(ruleName);
		if (!deps) {
			deps = new Set();
			factDependencies.set(ruleName, deps);
		}
		for (const fid of factIds) {
			deps.add(fid);
			let rules = factToRules.get(fid);
			if (!rules) {
				rules = new Set();
				factToRules.set(fid, rules);
			}
			rules.add(ruleName);
		}
	}

	function clearFactDependencies(ruleName: string): void {
		const deps = factDependencies.get(ruleName);
		if (!deps) return;
		for (const fid of deps) {
			const rules = factToRules.get(fid);
			if (rules) {
				rules.delete(ruleName);
				if (rules.size === 0) factToRules.delete(fid);
			}
		}
		factDependencies.delete(ruleName);
	}

	function retractByFact(factId: string, scope: ScopeManager): readonly string[] {
		const rules = factToRules.get(factId);
		if (!rules || rules.size === 0) return [];

		const revertedPaths: string[] = [];
		const rulesToRetract = [...rules];

		for (const ruleName of rulesToRetract) {
			if (!activeRules.has(ruleName)) continue;
			activeRules.delete(ruleName);
			const paths = scope.revertRule(ruleName);
			revertedPaths.push(...paths);
			clearFactDependencies(ruleName);
		}
		return revertedPaths;
	}

	function getProvenance(ruleName: string): readonly TmsProvenance[] {
		const deps = factDependencies.get(ruleName);
		if (!deps || deps.size === 0) return [];
		return [{ ruleName, factIds: [...deps] }];
	}

	return {
		ruleActivated,
		ruleDeactivated,
		shouldTrack,
		shouldAutoRetract,
		getActiveRules,
		removeRule,
		recordFactDependency,
		retractByFact,
		getProvenance,
	};
}
