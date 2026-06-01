import { describe, expect, test } from "vitest";
import { createRealClock, createVirtualClock } from "../clock.js";
import { ArbiterError } from "../errors.js";

describe("createRealClock", () => {
	test("returns approximately Date.now()", () => {
		const clock = createRealClock();
		const before = Date.now();
		const result = clock.now();
		const after = Date.now();
		expect(result).toBeGreaterThanOrEqual(before);
		expect(result).toBeLessThanOrEqual(after);
	});
});

describe("createVirtualClock", () => {
	test("starts at 0 by default", () => {
		const clock = createVirtualClock();
		expect(clock.now()).toBe(0);
	});

	test("starts at provided startTime", () => {
		const clock = createVirtualClock(5000);
		expect(clock.now()).toBe(5000);
	});

	test("advance(1000) moves time forward by 1000", () => {
		const clock = createVirtualClock(0);
		clock.advance(1000);
		expect(clock.now()).toBe(1000);
	});

	test("multiple advances accumulate", () => {
		const clock = createVirtualClock(0);
		clock.advance(100);
		clock.advance(200);
		clock.advance(300);
		expect(clock.now()).toBe(600);
	});

	test("setTime sets exact time", () => {
		const clock = createVirtualClock(0);
		clock.setTime(9999);
		expect(clock.now()).toBe(9999);
	});

	test("negative advance throws", () => {
		const clock = createVirtualClock(100);
		expect(() => clock.advance(-1)).toThrow(ArbiterError);
	});

	test("backward setTime throws", () => {
		const clock = createVirtualClock(500);
		expect(() => clock.setTime(499)).toThrow(ArbiterError);
	});

	test("same sequence produces same results (determinism)", () => {
		const run = () => {
			const c = createVirtualClock(0);
			c.advance(10);
			c.advance(20);
			c.setTime(100);
			c.advance(5);
			return c.now();
		};
		expect(run()).toBe(run());
		expect(run()).toBe(105);
	});
});
