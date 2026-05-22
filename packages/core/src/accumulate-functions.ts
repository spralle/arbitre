// ---------------------------------------------------------------------------
// Pure aggregate functions for accumulate nodes (L2 infrastructure).
// ---------------------------------------------------------------------------

import { ArbiterError, ArbiterErrorCode } from "./errors.js";

export type AccumulateFn = (values: readonly number[]) => number | null;

export const accumulateSum: AccumulateFn = (values) => {
  let total = 0;
  for (const v of values) {
    total += v;
  }
  return total;
};

export const accumulateCount: AccumulateFn = (values) => values.length;

export const accumulateMin: AccumulateFn = (values) => {
  if (values.length === 0) return null;
  let result = values[0]!;
  for (let i = 1; i < values.length; i++) {
    if (values[i]! < result) result = values[i]!;
  }
  return result;
};

export const accumulateMax: AccumulateFn = (values) => {
  if (values.length === 0) return null;
  let result = values[0]!;
  for (let i = 1; i < values.length; i++) {
    if (values[i]! > result) result = values[i]!;
  }
  return result;
};

export const accumulateAvg: AccumulateFn = (values) => {
  if (values.length === 0) return null;
  let total = 0;
  for (const v of values) {
    total += v;
  }
  return total / values.length;
};

export const ACCUMULATE_FUNCTIONS: Readonly<Record<string, AccumulateFn>> = {
  $sum: accumulateSum,
  $count: accumulateCount,
  $min: accumulateMin,
  $max: accumulateMax,
  $avg: accumulateAvg,
};

export function getAccumulateFn(name: string): AccumulateFn {
  const fn = ACCUMULATE_FUNCTIONS[name];
  if (!fn) {
    throw new ArbiterError(ArbiterErrorCode.INVALID_OPERATOR, `Unknown accumulate function: ${name}`, {
      details: { name },
    });
  }
  return fn;
}
