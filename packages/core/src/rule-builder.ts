import type { AccumulateConfig } from "./accumulate-node.js";
import type { ProductionRule } from "./contracts.js";
import type { FactPattern } from "./fact-pattern.js";

/**
 * Fluent builder for constructing ProductionRule definitions.
 * Provides a type-safe, discoverable API for rule creation.
 *
 * @example
 * ```typescript
 * const rule = defineRule("high-temp-alert")
 *   .when({ $gt: [{ $path: "sensors.temperature" }, 100] })
 *   .then([{ $set: { "alerts.overheating": true } }])
 *   .salience(10)
 *   .description("Fires when temperature exceeds safe threshold")
 *   .build();
 * ```
 */
export interface RuleBuilder {
	/** Set the rule condition (MongoDB-style query) */
	when(condition: ProductionRule["when"]): RuleBuilder;
	/** Set the then-actions pipeline */
	then(actions: ProductionRule["then"]): RuleBuilder;
	/** Set the else-actions pipeline (fires on deactivation) */
	else(actions: NonNullable<ProductionRule["else"]>): RuleBuilder;
	/** Set rule priority (higher fires first) */
	salience(value: number): RuleBuilder;
	/** Assign to an activation group */
	activationGroup(group: string): RuleBuilder;
	/** Set conflict resolution strategy */
	onConflict(strategy: "override" | "warn" | "error"): RuleBuilder;
	/** Set enabled state */
	enabled(value: boolean): RuleBuilder;
	/** Add human-readable description */
	description(text: string): RuleBuilder;
	/** Set expiry time in milliseconds */
	expires(ms: number): RuleBuilder;
	/** Add fact patterns for multi-fact matching */
	patterns(patterns: readonly FactPattern[]): RuleBuilder;
	/** Add accumulate configurations */
	accumulate(configs: readonly AccumulateConfig[]): RuleBuilder;
	/** Build the final ProductionRule object */
	build(): ProductionRule;
}

/**
 * Create a new rule builder with the given name.
 *
 * @param name - Unique rule identifier
 * @returns A fluent RuleBuilder instance
 */
export function defineRule(name: string): RuleBuilder {
	const rule: Partial<ProductionRule> & { name: string } = { name };

	const builder: RuleBuilder = {
		when(condition) {
			(rule as Record<string, unknown>).when = condition;
			return builder;
		},
		then(actions) {
			(rule as Record<string, unknown>).then = actions;
			return builder;
		},
		else(actions) {
			(rule as Record<string, unknown>).else = actions;
			return builder;
		},
		salience(value) {
			(rule as Record<string, unknown>).salience = value;
			return builder;
		},
		activationGroup(group) {
			(rule as Record<string, unknown>).activationGroup = group;
			return builder;
		},
		onConflict(strategy) {
			(rule as Record<string, unknown>).onConflict = strategy;
			return builder;
		},
		enabled(value) {
			(rule as Record<string, unknown>).enabled = value;
			return builder;
		},
		description(text) {
			(rule as Record<string, unknown>).description = text;
			return builder;
		},
		expires(ms) {
			(rule as Record<string, unknown>).expires = ms;
			return builder;
		},
		patterns(patterns) {
			(rule as Record<string, unknown>).patterns = patterns;
			return builder;
		},
		accumulate(configs) {
			(rule as Record<string, unknown>).accumulate = configs;
			return builder;
		},
		build() {
			if (!rule.when) throw new Error(`Rule "${name}" requires a when condition`);
			if (!rule.then) throw new Error(`Rule "${name}" requires then actions`);
			return rule as ProductionRule;
		},
	};

	return builder;
}
