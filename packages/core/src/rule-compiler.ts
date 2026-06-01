import { compile } from "kuery/compile";
import type { CompiledPattern, CompiledRule, ProductionRule } from "./contracts.js";
import { ArbiterError, ArbiterErrorCode } from "./errors.js";
import type { FactPattern } from "./fact-pattern.js";
import { compileThenActions } from "./then-compiler.js";
import { isRecord } from "./type-guards.js";
import { validateAccumulateConfigs } from "./validate-accumulate.js";
import { validatePatterns } from "./validate-patterns.js";

/**
 * Compiles a ProductionRule into a CompiledRule ready for the engine.
 */
export function compileRule(rule: ProductionRule<unknown>, customFnNames?: ReadonlySet<string>): CompiledRule {
	if (!rule.name) {
		throw new ArbiterError(ArbiterErrorCode.RULE_COMPILATION_FAILED, "Rule must have a name");
	}

	if (!rule.when || !isRecord(rule.when)) {
		throw new ArbiterError(
			ArbiterErrorCode.RULE_COMPILATION_FAILED,
			`Rule "${rule.name}" must have a "when" condition`,
			{ ruleName: rule.name },
		);
	}

	if (!rule.then || rule.then.length === 0) {
		throw new ArbiterError(
			ArbiterErrorCode.RULE_COMPILATION_FAILED,
			`Rule "${rule.name}" must have at least one "then" action`,
			{ ruleName: rule.name },
		);
	}

	const condition = compile(rule.when);
	const actions = compileThenActions(rule.then);
	const elseActions = rule.else ? compileThenActions(rule.else) : undefined;

	let compiledPatterns: readonly CompiledPattern[] | undefined;
	const hasPatterns = !!(rule.patterns && rule.patterns.length > 0);

	if (hasPatterns) {
		validatePatterns(rule.patterns as FactPattern[], rule.name);
		compiledPatterns = rule.patterns?.map((p) => ({
			$fact: p.$fact,
			$bind: p.$bind,
			$where: p.$where,
			$join: p.$join,
		}));
	}

	let accumulates: typeof rule.accumulate | undefined;
	if (rule.accumulate?.length) {
		validateAccumulateConfigs(rule.accumulate, rule.name, customFnNames);
		accumulates = rule.accumulate;
	}

	return {
		name: rule.name,
		condition,
		actions,
		elseActions,
		salience: rule.salience ?? 0,
		activationGroup: rule.activationGroup,
		onConflict: rule.onConflict ?? "warn",
		enabled: rule.enabled ?? true,
		hasTms: rule.else === undefined,
		hasPatterns,
		patterns: compiledPatterns,
		accumulates,
		source: rule,
	};
}
