import type { OperatorFunction } from "./contracts.js";

// ---------------------------------------------------------------------------
// Arithmetic operators
// ---------------------------------------------------------------------------

const $sum: OperatorFunction = (args) => {
  const items = Array.isArray(args[0]) ? (args[0] as readonly unknown[]) : args;
  let total = 0;
  for (const v of items) {
    if (v == null) continue;
    if (typeof v !== "number") return null;
    total += v;
  }
  return total;
};

const $multiply: OperatorFunction = (args) => {
  const items = Array.isArray(args[0]) ? (args[0] as readonly unknown[]) : args;
  let result = 1;
  for (const v of items) {
    if (v == null) return null;
    if (typeof v !== "number") return null;
    result *= v;
  }
  return result;
};

const $divide: OperatorFunction = (args) => {
  const [a, b] = args;
  if (typeof a !== "number" || typeof b !== "number") return null;
  if (b === 0) return null;
  return a / b;
};

const $subtract: OperatorFunction = (args) => {
  const [a, b] = args;
  if (typeof a !== "number" || typeof b !== "number") return null;
  return a - b;
};

const $round: OperatorFunction = (args) => {
  const [value, places] = args;
  if (typeof value !== "number") return null;
  const p = typeof places === "number" ? places : 0;
  const factor = 10 ** p;
  return Math.round(value * factor) / factor;
};

const $ceil: OperatorFunction = (args) => {
  const v = args[0];
  return typeof v === "number" ? Math.ceil(v) : null;
};

const $floor: OperatorFunction = (args) => {
  const v = args[0];
  return typeof v === "number" ? Math.floor(v) : null;
};

// ---------------------------------------------------------------------------
// Comparison / Selection operators
// ---------------------------------------------------------------------------

const $min: OperatorFunction = (args) => {
  const items = Array.isArray(args[0]) ? (args[0] as readonly unknown[]) : args;
  let result: number | null = null;
  for (const v of items) {
    if (v == null) continue;
    if (typeof v !== "number") return null;
    if (result === null || v < result) result = v;
  }
  return result;
};

const $max: OperatorFunction = (args) => {
  const items = Array.isArray(args[0]) ? (args[0] as readonly unknown[]) : args;
  let result: number | null = null;
  for (const v of items) {
    if (v == null) continue;
    if (typeof v !== "number") return null;
    if (result === null || v > result) result = v;
  }
  return result;
};

const $cond: OperatorFunction = (args) => {
  // Array form: [condition, trueVal, falseVal]
  if (args.length >= 3) {
    return args[0] ? args[1] : args[2];
  }
  // Object form passed as single arg: { if, then, else }
  const obj = args[0];
  if (obj != null && typeof obj === "object") {
    const rec = obj as Readonly<Record<string, unknown>>;
    return rec["if"] ? rec["then"] : rec["else"];
  }
  return null;
};

const $switch: OperatorFunction = (args) => {
  const obj = args[0];
  if (obj == null || typeof obj !== "object") return null;
  const rec = obj as Readonly<Record<string, unknown>>;
  const branches = rec["branches"];
  if (!Array.isArray(branches)) return null;
  for (const branch of branches) {
    if (branch != null && typeof branch === "object") {
      const b = branch as Readonly<Record<string, unknown>>;
      if (b["case"]) return b["then"];
    }
  }
  return rec["default"] ?? null;
};

const $ifNull: OperatorFunction = (args) => {
  for (const v of args) {
    if (v != null) return v;
  }
  return null;
};

// ---------------------------------------------------------------------------
// String operators
// ---------------------------------------------------------------------------

const $concat: OperatorFunction = (args) => {
  const items = Array.isArray(args[0]) && args.length === 1 ? (args[0] as readonly unknown[]) : args;
  let result = "";
  for (const v of items) {
    if (v == null) return null;
    result += String(v);
  }
  return result;
};

// ---------------------------------------------------------------------------
// Type conversion operators
// ---------------------------------------------------------------------------

const $toNumber: OperatorFunction = (args) => {
  const v = args[0];
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
};

const $toString: OperatorFunction = (args) => {
  const v = args[0];
  if (v == null) return null;
  return String(v);
};

const $toBool: OperatorFunction = (args) => {
  const v = args[0];
  if (v == null) return false;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v.length > 0;
  if (typeof v === "boolean") return v;
  return true;
};

// ---------------------------------------------------------------------------
// Special operators
// ---------------------------------------------------------------------------

const $literal: OperatorFunction = (args) => args[0];

const $avg: OperatorFunction = (args) => {
  const items = Array.isArray(args[0]) ? (args[0] as readonly unknown[]) : args;
  if (items.length === 0) return null;
  let sum = 0;
  let count = 0;
  for (const v of items) {
    if (v == null) continue;
    if (typeof v !== "number") return null;
    sum += v;
    count++;
  }
  return count === 0 ? null : sum / count;
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const EXPRESSION_OPERATORS: Readonly<Record<string, OperatorFunction>> = {
  $sum,
  $multiply,
  $divide,
  $subtract,
  $round,
  $ceil,
  $floor,
  $min,
  $max,
  $cond,
  $switch,
  $ifNull,
  $concat,
  $toNumber,
  $toString,
  $toBool,
  $literal,
  $avg,
};

export function createOperatorRegistry(
  custom?: Readonly<Record<string, OperatorFunction>>,
): Readonly<Record<string, OperatorFunction>> {
  return Object.freeze({
    ...EXPRESSION_OPERATORS,
    ...custom,
  });
}
