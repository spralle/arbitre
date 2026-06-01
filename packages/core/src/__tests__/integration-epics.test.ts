import { describe, expect, it } from "vitest";
import type { AccumulateConfig } from "../accumulate-node.js";
import type { ProductionRule } from "../contracts.js";
import type { FactPattern } from "../fact-pattern.js";
import { createSession, createVirtualClock } from "../index.js";

// ---------------------------------------------------------------------------
// Shared fact type definitions for e-commerce scenario
// ---------------------------------------------------------------------------

const customerFactType = {
	name: "Customer",
	fields: { custId: "string" as const, name: "string" as const, vip: "boolean" as const },
};

const orderFactType = {
	name: "Order",
	fields: { amount: "number" as const, customerId: "string" as const, status: "string" as const },
};

// ---------------------------------------------------------------------------
// Integration: All Three Epics Together
// ---------------------------------------------------------------------------

describe("Integration: All Three Epics Together", () => {
	it("e-commerce scenario: VIP tracking, rate limiting, and temporal offers", () => {
		const clock = createVirtualClock(0);

		// --- Patterns: VIP customer joined with their orders ---
		const vipPatterns: FactPattern[] = [
			{ $fact: "Customer", $bind: "customer", constraints: { vip: { $eq: true } } },
			{ $fact: "Order", $bind: "order", $join: { customerId: "$customer.custId" } },
		];

		// --- Accumulates ---
		const vipSpendTotal: AccumulateConfig = {
			factType: "Order",
			field: "amount",
			fn: "$sum",
			alias: "vipSpendTotal",
			binding: "order",
			rule: "vip-join",
		};

		const orderCount: AccumulateConfig = {
			factType: "Order",
			field: "",
			fn: "$count",
			alias: "orderCount",
		};

		const windowedOrderCount: AccumulateConfig = {
			factType: "Order",
			field: "",
			fn: "$count",
			alias: "recentOrderCount",
			window: 60_000, // 60 second window
		};

		// --- Rules ---
		// Rule 1: Join rule matching VIP + Orders (enables cross-type accumulate)
		const vipJoinRule: ProductionRule = {
			name: "vip-join",
			patterns: vipPatterns,
			when: { $always: true },
			then: [{ $set: { "status.vipMatched": true } }],
		};

		// Rule 2: VIP spend alert — fires when cross-type sum > 1000
		const vipSpendAlert: ProductionRule = {
			name: "vip-spend-alert",
			when: { "$aggregates.vipSpendTotal": { $gt: 1000 } },
			then: [{ $set: { "alerts.vipHighSpend": true } }],
			else: [{ $set: { "alerts.vipHighSpend": false } }],
		};

		// Rule 3: Rate limit — fires when windowed count > 5
		const rateLimitRule: ProductionRule = {
			name: "order-rate-limit",
			when: { "$aggregates.recentOrderCount": { $gt: 5 } },
			then: [{ $set: { "alerts.rateLimited": true } }],
			else: [{ $set: { "alerts.rateLimited": false } }],
		};

		// Rule 4: Welcome offer — temporal, expires after 30s
		const welcomeOffer: ProductionRule = {
			name: "welcome-offer",
			when: { "customer.isNew": { $eq: true } },
			then: [{ $set: { "offers.welcome": true } }],
			expires: 30_000,
		};

		// Rule 5: Tier upgrade — fires when total order count > 10
		const tierUpgrade: ProductionRule = {
			name: "tier-upgrade",
			when: { "$aggregates.orderCount": { $gt: 10 } },
			then: [{ $set: { "loyalty.tier": "gold" } }],
			else: [{ $set: { "loyalty.tier": "standard" } }],
		};

		const session = createSession({
			clock,
			factTypes: [customerFactType, orderFactType],
			accumulates: [vipSpendTotal, orderCount, windowedOrderCount],
			rules: [vipJoinRule, vipSpendAlert, rateLimitRule, welcomeOffer, tierUpgrade],
			tms: { autoRetract: "all" },
		});

		// --- Phase 1: Welcome offer fires ---
		session.assert("customer.isNew", true);
		session.tick(0);
		expect(session.getPath("offers.welcome")).toBe(true);

		// --- Phase 2: Create VIP customer + orders ---
		session.assertFact("Customer", { custId: "vip-1", name: "Alice", vip: true });

		// Add orders rapidly (all within 60s window)
		for (let i = 0; i < 5; i++) {
			session.assertFact("Order", { amount: 150, customerId: "vip-1", status: "completed" });
		}
		session.tick(1000);

		// VIP spend = 5 * 150 = 750, not yet > 1000
		expect(session.getPath("alerts.vipHighSpend")).toBeUndefined();
		// 5 orders in window — not yet rate limited (need > 5)
		expect(session.getPath("alerts.rateLimited")).toBeUndefined();
		// Total order count is 5, not > 10
		expect(session.getPath("loyalty.tier")).toBeUndefined();

		// --- Phase 3: More orders push past thresholds ---
		session.assertFact("Order", { amount: 150, customerId: "vip-1", status: "completed" });
		session.tick(2000);

		// 6 orders in window → rate limited
		expect(session.getPath("alerts.rateLimited")).toBe(true);
		// VIP spend = 6 * 150 = 900, still not > 1000
		expect(session.getPath("alerts.vipHighSpend")).toBeUndefined();

		// Two more orders push VIP spend over 1000
		session.assertFact("Order", { amount: 150, customerId: "vip-1", status: "completed" });
		session.tick(3000);
		// VIP spend = 7 * 150 = 1050 > 1000
		expect(session.getPath("alerts.vipHighSpend")).toBe(true);

		// --- Phase 4: Advance past rate limit window ---
		// All orders were asserted at roughly t=0..3000. Window is 60s.
		// At t=61000, all should be evicted from window.
		session.tick(61_000);
		expect(session.getPath("alerts.rateLimited")).toBe(false);
		// Non-windowed count still shows total
		expect(session.getPath("$aggregates.orderCount")).toBe(7);

		// --- Phase 5: Welcome offer expires after 30s ---
		// Offer was activated at t=0 with expires=30000
		// We already ticked to 61000 (past 30s), so it should be expired
		expect(session.getPath("offers.welcome")).toBeUndefined();

		// --- Phase 6: Continue adding orders for tier upgrade ---
		for (let i = 0; i < 4; i++) {
			session.assertFact("Order", { amount: 50, customerId: "vip-1", status: "completed" });
		}
		session.tick(62_000);
		// Total orders: 7 + 4 = 11 > 10 → tier upgrade
		expect(session.getPath("loyalty.tier")).toBe("gold");

		// --- Phase 7: TMS — retract VIP customer reverts VIP-specific state ---
		const facts = session.getFacts("Customer");
		const vipFact = facts.find((f) => f.data.custId === "vip-1");
		expect(vipFact).toBeDefined();
		session.retractFact(vipFact!.id);

		// VIP join no longer matches → cross-type accumulate resets
		// vipSpendTotal should drop, disabling the alert
		session.fire();
		expect(session.getPath("alerts.vipHighSpend")).toBe(false);
	});

	it("mixed rule evaluation: scope + patterns + temporal conditions", () => {
		const clock = createVirtualClock(0);

		// A rule requiring: scope condition + temporal ($meta.$now within range)
		// Demonstrates that ALL conditions must be satisfied simultaneously
		const businessHoursRule: ProductionRule = {
			name: "business-hours-processing",
			when: {
				$and: [
					{ "config.processingEnabled": { $eq: true } },
					{ "orders.hasPending": { $eq: true } },
					// Temporal: $meta.$now >= 9am (32400000ms) and < 5pm (61200000ms)
					{ "$meta.$now": { $gte: 32_400_000 } },
					{ "$meta.$now": { $lt: 61_200_000 } },
				],
			},
			then: [{ $set: { "processing.active": true } }],
			else: [{ $set: { "processing.active": false } }],
		};

		const session = createSession({
			clock,
			rules: [businessHoursRule],
		});

		// Set up scope conditions
		session.assert("config.processingEnabled", true);
		session.assert("orders.hasPending", true);

		// Before business hours (t=0 = midnight) — rule never active, else doesn't fire
		session.tick(0);
		expect(session.getPath("processing.active")).toBeUndefined();

		// During business hours (t=36000000 = 10am) — all conditions met
		session.tick(36_000_000);
		expect(session.getPath("processing.active")).toBe(true);

		// Disable feature flag — rule should deactivate even during business hours
		session.assert("config.processingEnabled", false);
		session.fire();
		expect(session.getPath("processing.active")).toBe(false);

		// Re-enable but outside business hours (t=72000000 = 8pm)
		session.assert("config.processingEnabled", true);
		session.tick(72_000_000);
		expect(session.getPath("processing.active")).toBe(false);
	});

	it("reactive cascade: fact → accumulate → rule → state → downstream rule", () => {
		const clock = createVirtualClock(0);

		const orderCountAcc: AccumulateConfig = {
			factType: "Order",
			field: "",
			fn: "$count",
			alias: "orderVolume",
		};

		// Rule 1: when order volume > 3, set highVolume flag
		const volumeRule: ProductionRule = {
			name: "high-volume-detect",
			when: { "$aggregates.orderVolume": { $gt: 3 } },
			then: [{ $set: { "state.highVolume": true } }],
			else: [{ $set: { "state.highVolume": false } }],
		};

		// Rule 2: downstream — reacts to highVolume state
		const alertRule: ProductionRule = {
			name: "high-volume-alert",
			when: { "state.highVolume": { $eq: true } },
			then: [{ $set: { "alerts.volumeAlert": "activated" } }],
			else: [{ $set: { "alerts.volumeAlert": "normal" } }],
		};

		const session = createSession({
			clock,
			factTypes: [orderFactType],
			accumulates: [orderCountAcc],
			rules: [volumeRule, alertRule],
		});

		// Assert 3 orders — not enough
		const ids: string[] = [];
		for (let i = 0; i < 3; i++) {
			ids.push(session.assertFact("Order", { amount: 10, customerId: "c1", status: "open" }));
		}
		// Rule never active yet, so else hasn't fired — state is undefined
		expect(session.getPath("state.highVolume")).toBeUndefined();
		expect(session.getPath("alerts.volumeAlert")).toBeUndefined();

		// 4th order crosses threshold → cascade fires
		ids.push(session.assertFact("Order", { amount: 10, customerId: "c1", status: "open" }));
		expect(session.getPath("state.highVolume")).toBe(true);
		expect(session.getPath("alerts.volumeAlert")).toBe("activated");

		// Retract orders below threshold → cascade reverses
		session.retractFact(ids[0]!);
		session.retractFact(ids[1]!);
		// Count is now 2 → below threshold
		expect(session.getPath("state.highVolume")).toBe(false);
		expect(session.getPath("alerts.volumeAlert")).toBe("normal");
	});
});
