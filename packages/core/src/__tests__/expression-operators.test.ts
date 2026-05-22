import { describe, expect, it } from "vitest";
import { createOperatorRegistry, EXPRESSION_OPERATORS } from "../expression-operators.js";

const scope: Readonly<Record<string, unknown>> = {};

describe("$sum", () => {
  const op = EXPRESSION_OPERATORS["$sum"]!;
  it("sums numbers", () => expect(op([1, 2, 3], scope)).toBe(6));
  it("treats null as 0", () => expect(op([1, null, 3], scope)).toBe(4));
  it("returns 0 for empty", () => expect(op([], scope)).toBe(0));
});

describe("$multiply", () => {
  const op = EXPRESSION_OPERATORS["$multiply"]!;
  it("multiplies numbers", () => expect(op([2, 3], scope)).toBe(6));
  it("with zero", () => expect(op([5, 0], scope)).toBe(0));
});

describe("$divide", () => {
  const op = EXPRESSION_OPERATORS["$divide"]!;
  it("divides", () => expect(op([10, 2], scope)).toBe(5));
  it("divide by zero returns null", () => expect(op([10, 0], scope)).toBeNull());
});

describe("$subtract", () => {
  const op = EXPRESSION_OPERATORS["$subtract"]!;
  it("subtracts", () => expect(op([10, 3], scope)).toBe(7));
});

describe("$round", () => {
  const op = EXPRESSION_OPERATORS["$round"]!;
  it("rounds to 2 places", () => expect(op([3.456, 2], scope)).toBe(3.46));
  it("rounds to 0 places", () => expect(op([3.456, 0], scope)).toBe(3));
});

describe("$ceil", () => {
  it("ceils", () => expect(EXPRESSION_OPERATORS["$ceil"]?.([3.2], scope)).toBe(4));
});

describe("$floor", () => {
  it("floors", () => expect(EXPRESSION_OPERATORS["$floor"]?.([3.8], scope)).toBe(3));
});

describe("$min", () => {
  it("finds minimum", () => expect(EXPRESSION_OPERATORS["$min"]?.([3, 1, 2], scope)).toBe(1));
});

describe("$max", () => {
  it("finds maximum", () => expect(EXPRESSION_OPERATORS["$max"]?.([3, 1, 2], scope)).toBe(3));
});

describe("$cond", () => {
  const op = EXPRESSION_OPERATORS["$cond"]!;
  it("true branch (array form)", () => expect(op([true, "yes", "no"], scope)).toBe("yes"));
  it("false branch (array form)", () => expect(op([false, "yes", "no"], scope)).toBe("no"));
});

describe("$switch", () => {
  const op = EXPRESSION_OPERATORS["$switch"]!;
  it("matching branch", () => {
    const arg = {
      branches: [
        { case: false, then: "a" },
        { case: true, then: "b" },
      ],
      default: "c",
    };
    expect(op([arg], scope)).toBe("b");
  });
  it("default when no match", () => {
    const arg = { branches: [{ case: false, then: "a" }], default: "c" };
    expect(op([arg], scope)).toBe("c");
  });
});

describe("$ifNull", () => {
  const op = EXPRESSION_OPERATORS["$ifNull"]!;
  it("returns first non-null", () => expect(op([null, undefined, 42], scope)).toBe(42));
  it("all null returns null", () => expect(op([null, undefined], scope)).toBeNull());
});

describe("$concat", () => {
  const op = EXPRESSION_OPERATORS["$concat"]!;
  it("concatenates strings", () => expect(op(["hello", " ", "world"], scope)).toBe("hello world"));
  it("null produces null", () => expect(op(["hello", null], scope)).toBeNull());
});

describe("$toNumber", () => {
  const op = EXPRESSION_OPERATORS["$toNumber"]!;
  it("string to number", () => expect(op(["42"], scope)).toBe(42));
  it("non-numeric returns null", () => expect(op(["abc"], scope)).toBeNull());
});

describe("$toString", () => {
  it("number to string", () => expect(EXPRESSION_OPERATORS["$toString"]?.([42], scope)).toBe("42"));
});

describe("$toBool", () => {
  const op = EXPRESSION_OPERATORS["$toBool"]!;
  it("truthy", () => expect(op([1], scope)).toBe(true));
  it("falsy", () => expect(op([0], scope)).toBe(false));
});

describe("$literal", () => {
  it("escapes expression-like objects", () => {
    const val = { $sum: 1 };
    expect(EXPRESSION_OPERATORS["$literal"]?.([val], scope)).toEqual({ $sum: 1 });
  });
});

describe("$avg", () => {
  const op = EXPRESSION_OPERATORS["$avg"]!;
  it("averages numbers", () => expect(op([1, 2, 3], scope)).toBe(2));
  it("empty returns null", () => expect(op([[]], scope)).toBeNull());
});

describe("createOperatorRegistry", () => {
  it("combines expression + custom operators", () => {
    const custom = { $custom: (() => "ok") as import("../contracts.js").OperatorFunction };
    const registry = createOperatorRegistry(custom);
    expect(registry["$sum"]).toBeDefined();
    expect(registry["$custom"]).toBeDefined();
    expect(registry["$custom"]?.([], scope)).toBe("ok");
  });
});
