/**
 * Temporal rules — time-based conditions and scheduling.
 *
 * Demonstrates:
 * - Virtual clock for deterministic testing
 * - Timer-based rule scheduling
 * - Rule expiry
 * - Temporal operators in conditions
 */
import { createSession, createVirtualClock, defineRule } from "@arbitre/core";

const clock = createVirtualClock(0);

const delayedRule = defineRule("delayed-action")
	.when({ $gte: [{ $path: "$meta.$now" }, 5000] })
	.then([{ $set: { triggered: true } }])
	.description("Triggers after 5 seconds")
	.build();

const expiringRule = defineRule("expiring-rule")
	.when({ active: { $eq: true } })
	.then([{ $set: { output: "present" } }])
	.expires(10000)
	.description("Auto-deactivates after 10s of being active")
	.build();

const session = createSession({
	rules: [delayedRule, expiringRule],
	initialState: { active: true, triggered: false, output: "" },
	clock,
});

// Advance time with tick()
console.log("t=0:", session.getState());

clock.advance(3000);
session.tick();
console.log("t=3s:", session.getState());

clock.advance(3000);
session.tick();
console.log("t=6s:", session.getState());
