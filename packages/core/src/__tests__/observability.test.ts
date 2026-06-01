import { describe, expect, it, vi } from "vitest";
import type { ProductionRule } from "../contracts.js";
import type { ArbiterLogger } from "../logger.js";
import { createSession } from "../session.js";

describe("Observability", () => {
	const simpleRule: ProductionRule = {
		name: "set-b",
		when: { "state.a": { $eq: true } },
		then: [{ $set: { "state.b": 1 } }],
	};

	describe("Hooks", () => {
		it("fires onRuleActivated when condition becomes true", () => {
			const onRuleActivated = vi.fn();
			const session = createSession({
				rules: [simpleRule],
				hooks: { onRuleActivated },
			});
			session.assert("state.a", true);
			session.fire();
			expect(onRuleActivated).toHaveBeenCalledTimes(1);
			expect(onRuleActivated.mock.calls[0][0].ruleName).toBe("set-b");
		});

		it("fires onRuleDeactivated when condition becomes false", () => {
			const onRuleDeactivated = vi.fn();
			const session = createSession({
				rules: [simpleRule],
				hooks: { onRuleDeactivated },
			});
			session.assert("state.a", true);
			session.fire();
			session.assert("state.a", false);
			session.fire();
			expect(onRuleDeactivated).toHaveBeenCalledTimes(1);
			expect(onRuleDeactivated.mock.calls[0][0].ruleName).toBe("set-b");
		});

		it("fires onRuleFired after rule executes", () => {
			const onRuleFired = vi.fn();
			const session = createSession({
				rules: [simpleRule],
				hooks: { onRuleFired },
			});
			session.assert("state.a", true);
			session.fire();
			expect(onRuleFired).toHaveBeenCalledTimes(1);
			expect(onRuleFired.mock.calls[0][0].ruleName).toBe("set-b");
			expect(onRuleFired.mock.calls[0][0].cycleNumber).toBe(1);
		});

		it("fires onCycleStart and onCycleEnd", () => {
			const onCycleStart = vi.fn();
			const onCycleEnd = vi.fn();
			const session = createSession({
				rules: [simpleRule],
				hooks: { onCycleStart, onCycleEnd },
			});
			session.assert("state.a", true);
			session.fire();
			expect(onCycleStart).toHaveBeenCalledTimes(1);
			expect(onCycleStart.mock.calls[0][0].cycleNumber).toBe(1);
			expect(onCycleEnd).toHaveBeenCalledTimes(1);
		});

		it("fires onFactAsserted and onFactRetracted", () => {
			const onFactAsserted = vi.fn();
			const onFactRetracted = vi.fn();
			const session = createSession({
				factTypes: [{ name: "item", fields: { name: "string" } }],
				hooks: { onFactAsserted, onFactRetracted },
			});
			const id = session.assertFact("item", { name: "x" });
			expect(onFactAsserted).toHaveBeenCalledTimes(1);
			expect(onFactAsserted.mock.calls[0][0].factId).toBe(id);
			session.retractFact(id);
			expect(onFactRetracted).toHaveBeenCalledTimes(1);
			expect(onFactRetracted.mock.calls[0][0].factId).toBe(id);
		});

		it("does not crash when hook throws", () => {
			const session = createSession({
				rules: [simpleRule],
				hooks: {
					onRuleActivated: () => {
						throw new Error("boom");
					},
					onRuleFired: () => {
						throw new Error("boom");
					},
				},
			});
			session.assert("state.a", true);
			expect(() => session.fire()).not.toThrow();
		});
	});

	describe("Logger", () => {
		it("accepts a custom logger without error", () => {
			const warn = vi.fn();
			const customLogger: ArbiterLogger = {
				debug() {},
				info() {},
				warn,
				error() {},
			};
			const session = createSession({
				rules: [simpleRule],
				logger: customLogger,
			});
			session.assert("state.a", true);
			expect(() => session.fire()).not.toThrow();
		});
	});

	describe("Introspection", () => {
		it("getRegisteredRules returns rule names", () => {
			const session = createSession({ rules: [simpleRule] });
			expect(session.introspect.getRegisteredRules()).toEqual(["set-b"]);
		});

		it("getActiveRules returns currently active rules", () => {
			const session = createSession({ rules: [simpleRule] });
			session.assert("state.a", true);
			session.fire();
			expect(session.introspect.getActiveRules()).toContain("set-b");
		});

		it("getAgendaEntries is empty after fire", () => {
			const session = createSession({ rules: [simpleRule] });
			session.assert("state.a", true);
			session.fire();
			expect(session.introspect.getAgendaEntries()).toEqual([]);
		});

		it("getMetrics accumulates across fire calls", () => {
			const rule2: ProductionRule = {
				name: "set-c",
				when: { "state.b": { $eq: 1 } },
				then: [{ $set: { "state.c": 2 } }],
			};
			const session = createSession({ rules: [simpleRule, rule2] });
			session.assert("state.a", true);
			session.fire();
			const m = session.introspect.getMetrics();
			expect(m.totalRulesFired).toBe(2);
			expect(m.totalCycles).toBeGreaterThanOrEqual(1);
		});

		it("getFactCounts reflects asserted facts", () => {
			const session = createSession({
				factTypes: [{ name: "order", fields: { amount: "number" } }],
			});
			session.assertFact("order", { amount: 10 });
			session.assertFact("order", { amount: 20 });
			expect(session.introspect.getFactCounts()).toEqual({ order: 2 });
		});

		it("metrics track facts across calls", () => {
			const session = createSession({
				factTypes: [{ name: "item", fields: { v: "number" } }],
			});
			const id = session.assertFact("item", { v: 1 });
			session.retractFact(id);
			const m = session.introspect.getMetrics();
			expect(m.totalFactsAsserted).toBe(1);
			expect(m.totalFactsRetracted).toBe(1);
		});
	});
});
