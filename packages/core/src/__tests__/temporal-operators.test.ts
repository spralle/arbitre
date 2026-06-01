import { describe, expect, it } from "vitest";
import { createSession, createVirtualClock } from "../index.js";
import { TEMPORAL_OPERATORS } from "../temporal-operators.js";

describe("temporal operators", () => {
	describe("$elapsed", () => {
		it("returns true when time difference exceeds threshold", () => {
			const scope = { "$meta.$now": 50000 };
			const result = TEMPORAL_OPERATORS.$elapsed([20000, 25000], scope);
			expect(result).toBe(true);
		});

		it("returns false when within threshold", () => {
			const scope = { "$meta.$now": 50000 };
			const result = TEMPORAL_OPERATORS.$elapsed([40000, 25000], scope);
			expect(result).toBe(false);
		});

		it("returns false when path value is undefined", () => {
			const scope = { "$meta.$now": 50000 };
			const result = TEMPORAL_OPERATORS.$elapsed([undefined, 25000], scope);
			expect(result).toBe(false);
		});

		it("returns false when $meta.$now is undefined", () => {
			const result = TEMPORAL_OPERATORS.$elapsed([20000, 25000], {});
			expect(result).toBe(false);
		});
	});

	describe("$within", () => {
		it("returns true when within window", () => {
			const scope = { "$meta.$now": 50000 };
			const result = TEMPORAL_OPERATORS.$within([40000, 25000], scope);
			expect(result).toBe(true);
		});

		it("returns false when outside window", () => {
			const scope = { "$meta.$now": 50000 };
			const result = TEMPORAL_OPERATORS.$within([20000, 25000], scope);
			expect(result).toBe(false);
		});

		it("returns false when path value is undefined", () => {
			const scope = { "$meta.$now": 50000 };
			const result = TEMPORAL_OPERATORS.$within([undefined, 25000], scope);
			expect(result).toBe(false);
		});

		it("returns false when $meta.$now is undefined", () => {
			const result = TEMPORAL_OPERATORS.$within([40000, 25000], {});
			expect(result).toBe(false);
		});
	});

	describe("$after", () => {
		it("returns true when now > timestamp", () => {
			const scope = { "$meta.$now": 50000 };
			const result = TEMPORAL_OPERATORS.$after([40000], scope);
			expect(result).toBe(true);
		});

		it("returns false when now <= timestamp", () => {
			const scope = { "$meta.$now": 50000 };
			const result = TEMPORAL_OPERATORS.$after([50000], scope);
			expect(result).toBe(false);
		});

		it("returns false when $meta.$now is undefined", () => {
			const result = TEMPORAL_OPERATORS.$after([40000], {});
			expect(result).toBe(false);
		});
	});

	describe("$before", () => {
		it("returns true when now < timestamp", () => {
			const scope = { "$meta.$now": 30000 };
			const result = TEMPORAL_OPERATORS.$before([50000], scope);
			expect(result).toBe(true);
		});

		it("returns false when now >= timestamp", () => {
			const scope = { "$meta.$now": 50000 };
			const result = TEMPORAL_OPERATORS.$before([50000], scope);
			expect(result).toBe(false);
		});

		it("returns false when $meta.$now is undefined", () => {
			const result = TEMPORAL_OPERATORS.$before([50000], {});
			expect(result).toBe(false);
		});
	});

	describe("integration with virtual clock", () => {
		it("temporal operators are auto-registered when clock is configured", () => {
			const clock = createVirtualClock(1000);
			const session = createSession({
				clock,
				initialState: { lastActivity: 500 },
				rules: [
					{
						name: "idle-check",
						when: { "$meta.$now": { $gt: 0 } },
						then: [{ $set: { isIdle: { $elapsed: ["$lastActivity", 300] } } }],
					},
				],
			});

			// At time=1000, elapsed since 500 = 500 > 300 → $elapsed returns true
			session.fire();
			expect(session.getPath("isIdle")).toBe(true);
			session.dispose();
		});

		it("$within works with virtual clock in session scope", () => {
			const clock = createVirtualClock(1000);
			const session = createSession({
				clock,
				initialState: { lastPing: 900 },
				rules: [
					{
						name: "recent-ping",
						when: { "$meta.$now": { $gt: 0 } },
						then: [{ $set: { isRecent: { $within: ["$lastPing", 200] } } }],
					},
				],
			});

			// At time=1000, within 200ms of 900 → 100 < 200 → true
			session.fire();
			expect(session.getPath("isRecent")).toBe(true);
			session.dispose();
		});

		it("$after and $before work with virtual clock", () => {
			const clock = createVirtualClock(5000);
			const session = createSession({
				clock,
				initialState: {},
				rules: [
					{
						name: "time-check",
						when: { "$meta.$now": { $gt: 0 } },
						then: [{ $set: { afterResult: { $after: [3000] } } }, { $set: { beforeResult: { $before: [3000] } } }],
					},
				],
			});

			// now=5000 > 3000 → $after true, $before false
			session.fire();
			expect(session.getPath("afterResult")).toBe(true);
			expect(session.getPath("beforeResult")).toBe(false);
			session.dispose();
		});
	});
});
