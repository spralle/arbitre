import { describe, expect, it } from "vitest";
import { createSession } from "../session.js";

describe("checkpoint / rollback", () => {
	it("restores state to checkpoint after mutations", () => {
		const session = createSession({
			initialState: { count: 0 },
			rules: [
				{
					name: "increment",
					when: { count: { $gt: 5 } },
					then: [{ $set: { alert: true } }],
				},
			],
		});

		session.assert("count", 3);
		session.fire();
		expect(session.getPath("alert")).toBeUndefined();

		const cp = session.checkpoint();

		session.assert("count", 10);
		session.fire();
		expect(session.getPath("alert")).toBe(true);
		expect(session.getPath("count")).toBe(10);

		session.rollback(cp);
		expect(session.getPath("count")).toBe(3);
		expect(session.getPath("alert")).toBeUndefined();
	});

	it("allows multiple checkpoints (stack-like)", () => {
		const session = createSession({ initialState: { x: 1 } });

		const cp1 = session.checkpoint();
		session.assert("x", 2);
		const cp2 = session.checkpoint();
		session.assert("x", 3);

		session.rollback(cp2);
		expect(session.getPath("x")).toBe(2);

		session.rollback(cp1);
		expect(session.getPath("x")).toBe(1);
	});

	it("fires correctly after rollback", () => {
		const session = createSession({
			initialState: { temp: 50 },
			rules: [
				{
					name: "overheat",
					when: { temp: { $gt: 100 } },
					then: [{ $set: { overheating: true } }],
				},
			],
		});

		const cp = session.checkpoint();

		session.assert("temp", 150);
		const r1 = session.fire();
		expect(r1.rulesFired).toBe(1);
		expect(session.getPath("overheating")).toBe(true);

		session.rollback(cp);

		const r2 = session.fire();
		expect(r2.rulesFired).toBe(0);
		expect(session.getPath("overheating")).toBeUndefined();
	});

	it("checkpoint on disposed session throws", () => {
		const session = createSession();
		session.dispose();
		expect(() => session.checkpoint()).toThrow();
	});
});
