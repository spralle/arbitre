import { describe, expect, test } from "vitest";
import type { AccumulateConfig } from "../accumulate-node.js";
import { createAccumulateNode } from "../accumulate-node.js";
import type { Fact } from "../fact-memory.js";

function makeFact(id: string, type: string, data: Record<string, unknown>): Fact {
  return { id, type, data };
}

const baseConfig: AccumulateConfig = {
  factType: "LineItem",
  field: "amount",
  fn: "$sum",
  alias: "$state.total",
};

describe("AccumulateNode addFact", () => {
  test("adds matching facts", () => {
    const node = createAccumulateNode(baseConfig);
    node.addFact(makeFact("f1", "LineItem", { amount: 10 }));
    expect(node.getValue()).toBe(10);
  });

  test("ignores wrong type", () => {
    const node = createAccumulateNode(baseConfig);
    node.addFact(makeFact("f1", "Other", { amount: 10 }));
    expect(node.getValue()).toBe(0);
    expect(node.getTrackedFactIds()).toEqual([]);
  });

  test("ignores fact if field missing", () => {
    const node = createAccumulateNode(baseConfig);
    node.addFact(makeFact("f1", "LineItem", { name: "x" }));
    expect(node.getValue()).toBe(0);
    expect(node.getTrackedFactIds()).toEqual([]);
  });
});

describe("AccumulateNode removeFact", () => {
  test("removes tracked fact", () => {
    const node = createAccumulateNode(baseConfig);
    const fact = makeFact("f1", "LineItem", { amount: 10 });
    node.addFact(fact);
    node.removeFact(fact);
    expect(node.getValue()).toBe(0);
    expect(node.getTrackedFactIds()).toEqual([]);
  });

  test("no-op for untracked fact", () => {
    const node = createAccumulateNode(baseConfig);
    node.removeFact(makeFact("f99", "LineItem", { amount: 5 }));
    expect(node.getValue()).toBe(0);
  });
});

describe("AccumulateNode incremental update", () => {
  test("add 3 facts, remove 1, check sum", () => {
    const node = createAccumulateNode(baseConfig);
    const f1 = makeFact("f1", "LineItem", { amount: 10 });
    const f2 = makeFact("f2", "LineItem", { amount: 20 });
    const f3 = makeFact("f3", "LineItem", { amount: 30 });
    node.addFact(f1);
    node.addFact(f2);
    node.addFact(f3);
    expect(node.getValue()).toBe(60);
    node.removeFact(f2);
    expect(node.getValue()).toBe(40);
  });
});

describe("AccumulateNode filter", () => {
  test("only accumulates facts matching filter", () => {
    const config: AccumulateConfig = {
      ...baseConfig,
      filter: { category: "food" },
    };
    const node = createAccumulateNode(config);
    node.addFact(makeFact("f1", "LineItem", { amount: 10, category: "food" }));
    node.addFact(makeFact("f2", "LineItem", { amount: 20, category: "drink" }));
    expect(node.getValue()).toBe(10);
    expect(node.getTrackedFactIds()).toEqual(["f1"]);
  });
});

describe("AccumulateNode recompute", () => {
  test("full recompute matches incremental", () => {
    const node = createAccumulateNode(baseConfig);
    const facts = [
      makeFact("f1", "LineItem", { amount: 5 }),
      makeFact("f2", "LineItem", { amount: 15 }),
      makeFact("f3", "Other", { amount: 100 }),
    ];
    node.recompute(facts);
    expect(node.getValue()).toBe(20);
    expect(node.getTrackedFactIds()).toEqual(["f1", "f2"]);
  });
});

describe("AccumulateNode reset", () => {
  test("clears all tracked facts", () => {
    const node = createAccumulateNode(baseConfig);
    node.addFact(makeFact("f1", "LineItem", { amount: 10 }));
    node.reset();
    expect(node.getValue()).toBe(0);
    expect(node.getTrackedFactIds()).toEqual([]);
  });
});

describe("AccumulateNode $count", () => {
  test("counts facts regardless of field value", () => {
    const config: AccumulateConfig = { ...baseConfig, fn: "$count" };
    const node = createAccumulateNode(config);
    node.addFact(makeFact("f1", "LineItem", { amount: 10 }));
    node.addFact(makeFact("f2", "LineItem", { name: "no-amount" }));
    expect(node.getValue()).toBe(2);
  });
});

describe("AccumulateNode multiple aggregate functions", () => {
  const facts = [
    makeFact("f1", "LineItem", { amount: 10 }),
    makeFact("f2", "LineItem", { amount: 20 }),
    makeFact("f3", "LineItem", { amount: 30 }),
  ];

  test("$min finds minimum", () => {
    const node = createAccumulateNode({ ...baseConfig, fn: "$min" });
    facts.forEach((f) => {
      node.addFact(f);
    });
    expect(node.getValue()).toBe(10);
  });

  test("$max finds maximum", () => {
    const node = createAccumulateNode({ ...baseConfig, fn: "$max" });
    facts.forEach((f) => {
      node.addFact(f);
    });
    expect(node.getValue()).toBe(30);
  });

  test("$avg computes average", () => {
    const node = createAccumulateNode({ ...baseConfig, fn: "$avg" });
    facts.forEach((f) => {
      node.addFact(f);
    });
    expect(node.getValue()).toBe(20);
  });
});
