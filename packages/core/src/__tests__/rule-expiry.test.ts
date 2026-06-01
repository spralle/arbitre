import { describe, expect, test } from "vitest";
import { createVirtualClock } from "../clock.js";
import type { ProductionRule } from "../contracts.js";
import { createSession } from "../session.js";

describe("rule expiry", () => {
	function makeRule(overrides: Partial<ProductionRule> = {}): ProductionRule {
		return {
			name: "expiring-rule",
			when: { "flags.active": { $eq: true } },
			then: [{ $set: { "ui.visible": true } }],
			expires: 5000,
			...overrides,
		};
	}

	test("rule with expires auto-deactivates after duration elapses", () => {
		const clock = createVirtualClock(0);
		const session = createSession({
			rules: [makeRule()],
			initialState: { flags: { active: true }, ui: { visible: false } },
			clock,
		});

		// Fire at t=0 — rule activates and writes
		session.tick(0);
		expect(session.getPath("ui.visible")).toBe(true);

		// At t=4999 — not yet expired
		session.tick(4999);
		expect(session.getPath("ui.visible")).toBe(true);

		// At t=5000 — expired, TMS retracts writes
		session.tick(5000);
		expect(session.getPath("ui.visible")).toBe(false);
	});

	test("TMS retracts writes on expiry", () => {
		const clock = createVirtualClock(0);
		const session = createSession({
			rules: [makeRule({ then: [{ $set: { "$ui.banner": "hello" } }] })],
			initialState: { flags: { active: true } },
			clock,
			tms: { autoRetract: "all" },
		});

		session.assert("$ui.banner", "");
		session.tick(0);
		expect(session.getPath("$ui.banner")).toBe("hello");

		session.tick(5000);
		expect(session.getPath("$ui.banner")).toBe("");
	});

	test("re-activation resets the timer", () => {
		const clock = createVirtualClock(0);
		const session = createSession({
			rules: [makeRule({ then: [{ $set: { "$ui.show": true } }] })],
			initialState: { flags: { active: true } },
			clock,
			tms: { autoRetract: "all" },
		});

		session.assert("$ui.show", false);

		// First activation at t=0
		session.tick(0);
		expect(session.getPath("$ui.show")).toBe(true);

		// At t=3000 — still active
		session.tick(3000);
		expect(session.getPath("$ui.show")).toBe(true);

		// Deactivate condition then re-activate to reset timer
		session.assert("flags.active", false);
		session.tick(3001);
		session.assert("flags.active", true);
		session.tick(3002);
		expect(session.getPath("$ui.show")).toBe(true);

		// Original expiry at t=5000 should NOT expire (timer was reset at 3002)
		session.tick(5000);
		expect(session.getPath("$ui.show")).toBe(true);

		// New expiry at t=3002+5000=8002
		session.tick(8002);
		expect(session.getPath("$ui.show")).toBe(false);
	});

	test("rules without expires are unaffected", () => {
		const clock = createVirtualClock(0);
		const session = createSession({
			rules: [
				{
					name: "no-expiry",
					when: { "flags.on": { $eq: true } },
					then: [{ $set: { "$ui.label": "persistent" } }],
				},
			],
			initialState: { flags: { on: true }, $ui: { label: "" } },
			clock,
			tms: { autoRetract: "all" },
		});

		session.tick(0);
		expect(session.getPath("$ui.label")).toBe("persistent");

		// Even after a long time, no expiry
		session.tick(999999);
		expect(session.getPath("$ui.label")).toBe("persistent");
	});

	test("multiple rules with different expiry durations", () => {
		const clock = createVirtualClock(0);
		const session = createSession({
			rules: [
				makeRule({ name: "fast", expires: 1000, then: [{ $set: { "$ui.fast": true } }] }),
				makeRule({ name: "slow", expires: 10000, then: [{ $set: { "$ui.slow": true } }] }),
			],
			initialState: { flags: { active: true } },
			clock,
			tms: { autoRetract: "all" },
		});

		session.assert("$ui.fast", false);
		session.assert("$ui.slow", false);

		session.tick(0);
		expect(session.getPath("$ui.fast")).toBe(true);
		expect(session.getPath("$ui.slow")).toBe(true);

		// After 1000ms — fast expires, slow still active
		session.tick(1000);
		expect(session.getPath("$ui.fast")).toBe(false);
		expect(session.getPath("$ui.slow")).toBe(true);

		// After 10000ms — slow expires too
		session.tick(10000);
		expect(session.getPath("$ui.slow")).toBe(false);
	});
});
