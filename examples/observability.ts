/**
 * Observability — hooks, logging, and introspection.
 *
 * Demonstrates:
 * - Lifecycle hooks for monitoring
 * - Custom logger integration
 * - Runtime introspection of engine state
 */
import { createSession, defineRule } from "@arbitre/core";
import type { ArbiterLogger, SessionHooks } from "@arbitre/core";

const hooks: SessionHooks = {
	onRuleActivated: (e) => console.log(`[hook] Rule activated: ${e.ruleName}`),
	onRuleFired: (e) => console.log(`[hook] Rule fired: ${e.ruleName}, changes: ${e.changes.length}`),
	onRuleDeactivated: (e) => console.log(`[hook] Rule deactivated: ${e.ruleName}`),
};

const logger: ArbiterLogger = {
	debug: (msg, ctx) => console.debug(`[debug] ${msg}`, ctx ?? ""),
	info: (msg, ctx) => console.info(`[info] ${msg}`, ctx ?? ""),
	warn: (msg, ctx) => console.warn(`[warn] ${msg}`, ctx ?? ""),
	error: (msg, ctx) => console.error(`[error] ${msg}`, ctx ?? ""),
};

const session = createSession({
	rules: [
		defineRule("counter")
			.when({ $gte: [{ $path: "value" }, 5] })
			.then([{ $set: { above5: true } }])
			.build(),
	],
	initialState: { value: 0, above5: false },
	hooks,
	logger,
});

// Introspect before firing
const introspect = session.introspect;
console.log("Registered rules:", introspect.getRegisteredRules());
console.log("Active rules:", introspect.getActiveRules());

// Update state to trigger rule
session.update("value", 10);

// Introspect after firing
console.log("Active rules after fire:", introspect.getActiveRules());
console.log("Metrics:", introspect.getMetrics());
