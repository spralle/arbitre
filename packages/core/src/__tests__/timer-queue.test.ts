import { describe, expect, it } from "vitest";
import { createTimerQueue } from "../timer-queue.js";

describe("createTimerQueue", () => {
	it("schedule adds a timer", () => {
		const queue = createTimerQueue();
		queue.schedule("ruleA", { delay: 5000 }, 1000);
		const all = queue.getAll();
		expect(all).toHaveLength(1);
		expect(all[0]?.ruleName).toBe("ruleA");
		expect(all[0]?.fireAt).toBe(6000);
		expect(all[0]?.repeat).toBe(false);
		expect(all[0]?.interval).toBe(5000);
	});

	it("getDueTimers returns timers where fireAt <= now", () => {
		const queue = createTimerQueue();
		queue.schedule("early", { delay: 1000 }, 0);
		queue.schedule("late", { delay: 5000 }, 0);
		const due = queue.getDueTimers(2000);
		expect(due).toHaveLength(1);
		expect(due[0]?.ruleName).toBe("early");
	});

	it("advanceDueTimers removes one-shot timers", () => {
		const queue = createTimerQueue();
		queue.schedule("oneshot", { delay: 1000 }, 0);
		const fired = queue.advanceDueTimers(1000);
		expect(fired).toEqual(["oneshot"]);
		expect(queue.getAll()).toHaveLength(0);
	});

	it("advanceDueTimers reschedules repeating timers", () => {
		const queue = createTimerQueue();
		queue.schedule("repeater", { delay: 1000, repeat: true }, 0);
		const fired = queue.advanceDueTimers(1000);
		expect(fired).toEqual(["repeater"]);
		const all = queue.getAll();
		expect(all).toHaveLength(1);
		expect(all[0]?.fireAt).toBe(2000);
	});

	it("cancel removes a timer", () => {
		const queue = createTimerQueue();
		queue.schedule("ruleA", { delay: 5000 }, 0);
		queue.cancel("ruleA");
		expect(queue.getAll()).toHaveLength(0);
	});

	it("same rule: last schedule wins", () => {
		const queue = createTimerQueue();
		queue.schedule("ruleA", { delay: 1000 }, 0);
		queue.schedule("ruleA", { delay: 3000 }, 0);
		const all = queue.getAll();
		expect(all).toHaveLength(1);
		expect(all[0]?.fireAt).toBe(3000);
	});
});
