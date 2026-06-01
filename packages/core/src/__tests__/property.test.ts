import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createSession } from "../session.js";

describe("Property-based tests", () => {
	it("fire() is idempotent when state unchanged", () => {
		fc.assert(
			fc.property(fc.integer({ min: -1000, max: 1000 }), (threshold) => {
				const session = createSession({
					rules: [
						{
							name: "threshold-rule",
							when: { value: { $gt: threshold } },
							then: [{ $set: { active: true } }],
						},
					],
					initialState: { value: threshold + 1, active: false },
				});
				const r1 = session.fire();
				expect(r1.rulesFired).toBeGreaterThan(0);
				const r2 = session.fire();
				expect(r2.changes).toHaveLength(0);
				expect(r2.rulesFired).toBe(0);
			}),
			{ numRuns: 50 },
		);
	});

	it("TMS retraction restores state on deactivation", () => {
		fc.assert(
			fc.property(
				fc
					.string({ minLength: 1, maxLength: 10 })
					.filter((s) => /^[a-z]+$/.test(s) && !["prototype", "constructor", "proto"].includes(s)),
				fc.integer({ min: 0, max: 100 }),
				(key, value) => {
					const session = createSession({
						rules: [
							{
								name: "conditional-write",
								when: { flag: true },
								then: [{ $set: { [`$state.${key}`]: value } }],
							},
						],
						initialState: { flag: true },
					});
					session.fire();
					expect(session.getPath(`$state.${key}`)).toBe(value);
					// Deactivate the rule
					session.assert("flag", false);
					session.fire();
					// The write should be retracted by TMS
					expect(session.getPath(`$state.${key}`)).toBeUndefined();
				},
			),
			{ numRuns: 50 },
		);
	});

	it("higher salience rules fire before lower", () => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 100 }), fc.integer({ min: 1, max: 100 }), (sal1, sal2) => {
				fc.pre(sal1 !== sal2);
				const session = createSession({
					rules: [
						{
							name: "rule-a",
							when: { active: true },
							then: [{ $set: { "$state.a": true } }],
							salience: sal1,
						},
						{
							name: "rule-b",
							when: { active: true },
							then: [{ $set: { "$state.b": true } }],
							salience: sal2,
						},
					],
					initialState: { active: true },
				});
				const result = session.fire();
				const firstChange = result.changes[0];
				if (sal1 > sal2) {
					expect(firstChange?.ruleName).toBe("rule-a");
				} else {
					expect(firstChange?.ruleName).toBe("rule-b");
				}
			}),
			{ numRuns: 50 },
		);
	});

	it("assertFact + retractFact leaves memory empty", () => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 1000 }), (value) => {
				const session = createSession({
					factTypes: [{ name: "counter", fields: { n: "number" } }],
				});
				const id = session.assertFact("counter", { n: value });
				session.retractFact(id);
				expect(session.getFacts("counter")).toHaveLength(0);
			}),
			{ numRuns: 50 },
		);
	});

	it("runaway rules are stopped by cycle limit", () => {
		fc.assert(
			fc.property(fc.integer({ min: 2, max: 20 }), (maxCycles) => {
				const session = createSession({
					rules: [
						{
							name: "runaway",
							when: { counter: { $gte: 0 } },
							then: [{ $inc: { counter: 1 } }],
						},
					],
					initialState: { counter: 0 },
					limits: { maxCycles },
				});
				expect(() => session.fire()).toThrow();
			}),
			{ numRuns: 50 },
		);
	});

	it("all writes from one rule appear atomically in state", () => {
		fc.assert(
			fc.property(fc.integer({ min: 1, max: 50 }), fc.integer({ min: 1, max: 50 }), (a, b) => {
				const session = createSession({
					rules: [
						{
							name: "multi-write",
							when: { trigger: true },
							then: [{ $set: { "$state.a": a, "$state.b": b } }],
						},
					],
					initialState: { trigger: true },
				});
				session.fire();
				expect(session.getPath("$state.a")).toBe(a);
				expect(session.getPath("$state.b")).toBe(b);
			}),
			{ numRuns: 50 },
		);
	});
});
