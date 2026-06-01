import { describe, expect, it } from "vitest";
import { createVirtualClock } from "../clock.js";
import { createSession } from "../session.js";

describe("session clock integration", () => {
	it("injects $meta.$now with virtual clock at initial time", () => {
		const clock = createVirtualClock(0);
		const session = createSession({ clock });
		session.fire();
		expect(session.getPath("$meta.$now")).toBe(0);
	});

	it("tick() advances clock and updates $meta.$now", () => {
		const clock = createVirtualClock(0);
		const session = createSession({ clock });
		clock.advance(3000);
		session.tick();
		expect(session.getPath("$meta.$now")).toBe(3000);
	});

	it("tick(now) sets virtual clock time and fires", () => {
		const clock = createVirtualClock(0);
		const session = createSession({ clock });
		session.tick(10000);
		expect(session.getPath("$meta.$now")).toBe(10000);
	});

	it("rule with time condition fires only after time advances past threshold", () => {
		const clock = createVirtualClock(0);
		const session = createSession({
			clock,
			rules: [
				{
					name: "time-gate",
					when: { "$meta.$now": { $gt: 5000 } },
					then: [{ $set: { triggered: true } }],
				},
			],
		});

		session.tick();
		expect(session.getPath("triggered")).toBeUndefined();

		session.tick(6000);
		expect(session.getPath("triggered")).toBe(true);
	});

	it("tick() throws when no clock configured", () => {
		const session = createSession();
		expect(() => session.tick()).toThrow("Clock not configured");
	});

	it("$meta.$now is not present without clock", () => {
		const session = createSession();
		session.fire();
		expect(session.getPath("$meta.$now")).toBeUndefined();
	});

	it("backward compat: rules without time conditions work as before", () => {
		const session = createSession({
			rules: [
				{
					name: "simple",
					when: { count: { $gt: 0 } },
					then: [{ $set: { active: true } }],
				},
			],
		});
		session.update("count", 5);
		expect(session.getPath("active")).toBe(true);
	});
});
