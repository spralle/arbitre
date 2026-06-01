import { describe, expect, it } from "vitest";
import type { ProductionRule } from "../contracts.js";
import { createSession, createVirtualClock } from "../index.js";

describe("session timer scheduling", () => {
	function makeRule(name: string): ProductionRule {
		return {
			name,
			when: { $always: true },
			then: [{ $set: { [`${name}.fired`]: true } }],
		};
	}

	it("scheduleRule + tick past delay fires the rule", () => {
		const clock = createVirtualClock(0);
		const session = createSession({ clock, rules: [makeRule("alarm")] });
		session.scheduleRule("alarm", { delay: 5000 });
		// Not yet due
		const r1 = session.tick(3000);
		expect(r1.rulesFired).toBe(0);
		// Now due
		const r2 = session.tick(5000);
		expect(r2.rulesFired).toBeGreaterThanOrEqual(1);
	});

	it("repeating timer fires on each tick past interval", () => {
		const clock = createVirtualClock(0);
		const session = createSession({ clock, rules: [makeRule("pulse")] });
		session.scheduleRule("pulse", { delay: 1000, repeat: true });

		const r1 = session.tick(1000);
		expect(r1.rulesFired).toBeGreaterThanOrEqual(1);

		const r2 = session.tick(2000);
		expect(r2.rulesFired).toBeGreaterThanOrEqual(1);
	});

	it("cancelSchedule prevents timer from firing", () => {
		const clock = createVirtualClock(0);
		const session = createSession({ clock, rules: [makeRule("cancelled")] });
		session.scheduleRule("cancelled", { delay: 1000 });
		session.cancelSchedule("cancelled");
		const r = session.tick(2000);
		expect(r.rulesFired).toBe(0);
	});

	it("scheduleRule without clock throws", () => {
		const session = createSession({ rules: [makeRule("noClock")] });
		expect(() => session.scheduleRule("noClock", { delay: 1000 })).toThrow();
	});

	it("timer does not fire before delay elapses", () => {
		const clock = createVirtualClock(1000);
		const session = createSession({ clock, rules: [makeRule("delayed")] });
		session.scheduleRule("delayed", { delay: 5000 });
		const r = session.tick(4000);
		expect(r.rulesFired).toBe(0);
	});
});
