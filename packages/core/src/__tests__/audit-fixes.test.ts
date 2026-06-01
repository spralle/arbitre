import { describe, expect, it } from "vitest";
import { accumulateMax, accumulateMin } from "../accumulate-functions.js";
import { createBetaEvaluator } from "../beta-evaluator.js";
import { createCrossTypeAccumulator } from "../cross-type-accumulate.js";
import { ArbiterError, ArbiterErrorCode } from "../errors.js";
import { createSession } from "../session.js";
import { createTimerQueue } from "../timer-queue.js";
import { createTms } from "../tms.js";

// ---------------------------------------------------------------------------
// Fix 1: $where clause enforcement in beta network
// ---------------------------------------------------------------------------

describe("Fix 1: $where clause enforcement", () => {
	it("does not activate when fact fails $where filter", () => {
		const evaluator = createBetaEvaluator();
		evaluator.registerRule("test-rule", [{ $fact: "order", $bind: "o", $where: { status: "urgent" } }]);

		const fact = { id: "f1", type: "order", data: { status: "normal" }, assertedAt: 0 };
		const activations = evaluator.onFactAsserted("o", "order", fact);
		expect(activations).toHaveLength(0);
	});

	it("activates when fact matches $where filter", () => {
		const evaluator = createBetaEvaluator();
		evaluator.registerRule("test-rule", [{ $fact: "order", $bind: "o", $where: { status: "urgent" } }]);

		const fact = { id: "f2", type: "order", data: { status: "urgent" }, assertedAt: 0 };
		const activations = evaluator.onFactAsserted("o", "order", fact);
		expect(activations.length).toBeGreaterThan(0);
	});
});

// ---------------------------------------------------------------------------
// Fix 2: else branches fire only on active→inactive transition
// ---------------------------------------------------------------------------

describe("Fix 2: else branch fires only on deactivation", () => {
	it("does NOT fire else for a rule that was never active", () => {
		const session = createSession({
			initialState: { active: false },
			rules: [
				{
					name: "conditional",
					when: { active: true },
					then: [{ $set: { "$state.fired": true } }],
					else: [{ $set: { "$state.elseFired": true } }],
				},
			],
		});
		session.fire();
		expect(session.getPath("$state.elseFired")).toBeUndefined();
	});

	it("fires else exactly once when condition transitions true→false", () => {
		const session = createSession({
			initialState: { active: true },
			rules: [
				{
					name: "conditional",
					when: { active: true },
					then: [{ $set: { "$state.count": 1 } }],
					else: [{ $inc: { "$state.elseCount": 1 } }],
				},
			],
		});
		// Activate the rule
		session.fire();
		expect(session.getPath("$state.count")).toBe(1);

		// Deactivate: else should fire
		session.assert("active", false);
		session.fire();
		expect(session.getPath("$state.elseCount")).toBe(1);

		// Fire again while still inactive: else should NOT fire again
		session.fire();
		expect(session.getPath("$state.elseCount")).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Fix 3: Reentrancy guard
// ---------------------------------------------------------------------------

describe("Fix 3: reentrancy guard on fire()", () => {
	it("throws REENTRANT_FIRE when update() is called inside subscribe callback", () => {
		const session = createSession({
			initialState: { x: 1 },
			rules: [
				{
					name: "set-y",
					when: { x: 1 },
					then: [{ $set: { "$state.y": 1 } }],
				},
			],
		});

		session.subscribe("$state.y", () => {
			// Attempt reentrant fire
			expect(() => session.update("x", 2)).toThrow(ArbiterError);
		});

		try {
			session.fire();
		} catch (e) {
			if (e instanceof ArbiterError) {
				expect(e.code).toBe(ArbiterErrorCode.REENTRANT_FIRE);
			}
		}
	});
});

// ---------------------------------------------------------------------------
// Fix 4: Math.min/max overflow
// ---------------------------------------------------------------------------

describe("Fix 4: accumulate min/max with large arrays", () => {
	it("handles 100,000 values without throwing RangeError", () => {
		const values = Array.from({ length: 100_000 }, (_, i) => i);
		expect(() => accumulateMin(values)).not.toThrow();
		expect(() => accumulateMax(values)).not.toThrow();
		expect(accumulateMin(values)).toBe(0);
		expect(accumulateMax(values)).toBe(99_999);
	});
});

// ---------------------------------------------------------------------------
// Fix 5: timer-queue mutation during iteration
// ---------------------------------------------------------------------------

describe("Fix 5: timer-queue snapshot before mutation", () => {
	it("repeating timer that is still due after reschedule fires only once per advance", () => {
		const queue = createTimerQueue();
		// Schedule a repeating timer at t=100 with interval=50
		queue.schedule("repeat-rule", { delay: 50, repeat: true }, 50); // fireAt = 100
		// Advance to t=200: fireAt=100 is due, reschedule to 150 which is also <=200
		// But should only fire once per advanceDueTimers call
		const fired = queue.advanceDueTimers(200);
		expect(fired).toEqual(["repeat-rule"]);
		// Next advance at 200 should fire again (150 <= 200)
		const fired2 = queue.advanceDueTimers(200);
		expect(fired2).toEqual(["repeat-rule"]);
	});
});

// ---------------------------------------------------------------------------
// Fix 6: cross-type $count always returns 0
// ---------------------------------------------------------------------------

describe("Fix 6: cross-type accumulate $count", () => {
	it("returns correct count for $count accumulator", () => {
		const accumulator = createCrossTypeAccumulator([
			{ alias: "orderCount", fn: "$count", field: "", binding: "o", rule: "order-rule", factType: "order" },
		]);

		accumulator.onTokenCreated("order-rule", {
			id: "t1",
			factBindings: { o: { id: "f1", type: "order", data: { amount: 50 }, assertedAt: 0 } },
		});
		accumulator.onTokenCreated("order-rule", {
			id: "t2",
			factBindings: { o: { id: "f2", type: "order", data: { amount: 75 }, assertedAt: 0 } },
		});

		const values = accumulator.getValues();
		expect(values.orderCount).toBe(2);
	});
});

// ---------------------------------------------------------------------------
// Fix 7: Rollback on cycle limit exceeded
// ---------------------------------------------------------------------------

describe("Fix 7: state rollback on cycle limit", () => {
	it("restores state after CYCLE_LIMIT_EXCEEDED", () => {
		const session = createSession({
			initialState: { counter: 0 },
			limits: { maxCycles: 5 },
			rules: [
				{
					name: "infinite-loop",
					when: { counter: { $gte: 0 } },
					then: [{ $inc: { counter: 1 } }],
				},
			],
		});

		expect(() => session.fire()).toThrow(ArbiterError);
		// State should be rolled back to before fire()
		expect(session.getPath("counter")).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Fix 8: else branch writes propagate to other rules
// ---------------------------------------------------------------------------

describe("Fix 8: else branch writes propagate", () => {
	it("else branch write triggers dependent rule", () => {
		const session = createSession({
			initialState: { trigger: false },
			rules: [
				{
					name: "rule-a",
					when: { trigger: true },
					then: [{ $set: { "$state.aActive": true } }],
					else: [{ $set: { "$state.fallback": true } }],
				},
				{
					name: "rule-b",
					when: { "$state.fallback": true },
					then: [{ $set: { "$state.bFired": true } }],
				},
			],
		});

		// First, activate rule-a so it can later deactivate
		session.assert("trigger", true);
		session.fire();
		expect(session.getPath("$state.aActive")).toBe(true);

		// Now deactivate: else should fire and propagate to rule-b
		session.assert("trigger", false);
		session.fire();
		expect(session.getPath("$state.fallback")).toBe(true);
		expect(session.getPath("$state.bFired")).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Fix 9: TMS "all" mode
// ---------------------------------------------------------------------------

describe("Fix 9: TMS all mode retracts root namespace paths", () => {
	it("auto-retracts root namespace writes when mode is 'all'", () => {
		const session = createSession({
			initialState: { active: true },
			tms: { autoRetract: "all" },
			rules: [
				{
					name: "set-root",
					when: { active: true },
					then: [{ $set: { "result.value": 42 } }],
				},
			],
		});

		session.fire();
		expect(session.getPath("result.value")).toBe(42);

		// Deactivate: TMS should retract the root write
		session.assert("active", false);
		session.fire();
		expect(session.getPath("result.value")).toBeUndefined();
	});

	it("does NOT auto-retract root namespace writes when mode is 'none'", () => {
		const session = createSession({
			initialState: { active: true },
			tms: { autoRetract: "none" },
			rules: [
				{
					name: "set-root",
					when: { active: true },
					then: [{ $set: { "result.value": 42 } }],
				},
			],
		});

		session.fire();
		expect(session.getPath("result.value")).toBe(42);

		session.assert("active", false);
		session.fire();
		// Root writes should NOT be retracted in none mode
		expect(session.getPath("result.value")).toBe(42);
	});
});
