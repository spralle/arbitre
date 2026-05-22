import { describe, expect, test } from "vitest";
import {
  accumulateAvg,
  accumulateCount,
  accumulateMax,
  accumulateMin,
  accumulateSum,
  getAccumulateFn,
} from "../accumulate-functions.js";
import { ArbiterError } from "../errors.js";

describe("accumulateSum", () => {
  test("returns 0 for empty array", () => {
    expect(accumulateSum([])).toBe(0);
  });
  test("sums single value", () => {
    expect(accumulateSum([5])).toBe(5);
  });
  test("sums multiple values", () => {
    expect(accumulateSum([1, 2, 3])).toBe(6);
  });
  test("handles negative values", () => {
    expect(accumulateSum([10, -3, -2])).toBe(5);
  });
});

describe("accumulateCount", () => {
  test("returns 0 for empty array", () => {
    expect(accumulateCount([])).toBe(0);
  });
  test("counts multiple values", () => {
    expect(accumulateCount([1, 2, 3])).toBe(3);
  });
});

describe("accumulateMin", () => {
  test("returns null for empty array", () => {
    expect(accumulateMin([])).toBeNull();
  });
  test("returns single value", () => {
    expect(accumulateMin([7])).toBe(7);
  });
  test("finds minimum", () => {
    expect(accumulateMin([3, 1, 2])).toBe(1);
  });
});

describe("accumulateMax", () => {
  test("returns null for empty array", () => {
    expect(accumulateMax([])).toBeNull();
  });
  test("returns single value", () => {
    expect(accumulateMax([7])).toBe(7);
  });
  test("finds maximum", () => {
    expect(accumulateMax([3, 1, 2])).toBe(3);
  });
});

describe("accumulateAvg", () => {
  test("returns null for empty array", () => {
    expect(accumulateAvg([])).toBeNull();
  });
  test("returns single value", () => {
    expect(accumulateAvg([4])).toBe(4);
  });
  test("computes correct average", () => {
    expect(accumulateAvg([2, 4, 6])).toBe(4);
  });
});

describe("getAccumulateFn", () => {
  test("resolves known names", () => {
    expect(getAccumulateFn("$sum")).toBe(accumulateSum);
    expect(getAccumulateFn("$count")).toBe(accumulateCount);
    expect(getAccumulateFn("$min")).toBe(accumulateMin);
    expect(getAccumulateFn("$max")).toBe(accumulateMax);
    expect(getAccumulateFn("$avg")).toBe(accumulateAvg);
  });
  test("throws ArbiterError for unknown name", () => {
    expect(() => getAccumulateFn("$unknown")).toThrow(ArbiterError);
  });
});
