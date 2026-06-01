/**
 * Basic rule engine usage — temperature monitoring.
 *
 * Demonstrates:
 * - Simple condition/action rules
 * - Salience-based priority
 * - TMS auto-retraction on deactivation
 */
import { createSession, defineRule } from "@arbitre/core";

// Define rules using the fluent builder
const alertRule = defineRule("high-temp-alert")
	.when({ $gt: [{ $path: "sensors.temperature" }, 100] })
	.then([{ $set: { "alerts.overheating": true } }])
	.salience(10)
	.description("Fires when temperature exceeds safe threshold")
	.build();

const normalRule = defineRule("temp-normal")
	.when({ $lte: [{ $path: "sensors.temperature" }, 100] })
	.then([{ $set: { status: "normal" } }])
	.build();

// Create session with initial state
const session = createSession({
	rules: [alertRule, normalRule],
	initialState: {
		sensors: { temperature: 105 },
		alerts: { overheating: false },
		status: "unknown",
	},
});

// Fire rules — high temp triggers the alert
const result = session.fire();
console.log(`Rules fired: ${result.rulesFired}`);
console.log("State:", session.getState());

// Update temperature — TMS auto-retracts the alert
session.assert("sensors.temperature", 80);
const result2 = session.fire();
console.log(`After cooldown — rules fired: ${result2.rulesFired}`);
console.log("State:", session.getState());
