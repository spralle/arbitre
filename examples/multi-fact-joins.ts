/**
 * Multi-fact join matching — order processing.
 *
 * Demonstrates:
 * - Fact types and working memory
 * - Pattern matching across multiple fact types
 * - Join constraints between facts
 * - Accumulate for aggregation
 */
import { createSession, defineRule } from "@arbitre/core";

const vipOrderRule = defineRule("vip-order-discount")
	.when({ $always: true })
	.then([{ $set: { "result.discount": 0.2 } }])
	.patterns([
		{ $fact: "customer", $bind: "customer", $where: { tier: "vip" } },
		{ $fact: "order", $bind: "order", $where: { status: "pending" } },
	])
	.description("Apply 20% discount to pending orders from VIP customers")
	.build();

const session = createSession({
	rules: [vipOrderRule],
	factTypes: [
		{ name: "customer", fields: { name: "string", tier: "string" } },
		{ name: "order", fields: { status: "string", amount: "number" } },
	],
	initialState: { result: {} },
});

session.assertFact("customer", { name: "Alice", tier: "vip" });
session.assertFact("order", { status: "pending", amount: 100 });

console.log("State:", session.getState());
