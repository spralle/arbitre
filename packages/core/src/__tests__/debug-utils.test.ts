import { describe, expect, it } from "vitest";
import type { FiringResult, ProductionRule } from "../contracts.js";
import { dumpState, explainResult, formatChanges } from "../debug/index.js";
import { createTestSession, fireWith } from "../testing/index.js";

const rule: ProductionRule = {
  name: "calc-total",
  when: { ready: true },
  then: [{ $set: { "$state.total": 110 } }],
};

describe("explainResult", () => {
  it("formats a simple result", () => {
    const result = fireWith([rule], { ready: true });
    const output = explainResult(result);
    expect(output).toContain("Fired");
    expect(output).toContain("calc-total");
    expect(output).toContain("$state.total");
    expect(output).toContain("Warnings:");
  });

  it("handles empty result", () => {
    const empty: FiringResult = { rulesFired: 0, cycles: 0, changes: [], warnings: [] };
    const output = explainResult(empty);
    expect(output).toContain("Fired 0 rules in 0 cycles");
    expect(output).toContain("(none)");
    expect(output).toContain("Warnings: none");
  });
});

describe("formatChanges", () => {
  it("lists all changes", () => {
    const result = fireWith([rule], { ready: true });
    const output = formatChanges(result);
    expect(output).toContain("$state.total");
    expect(output).toContain("calc-total");
  });
});

describe("dumpState", () => {
  it("returns valid JSON", () => {
    const session = createTestSession([rule], { ready: true });
    session.fire();
    const json = dumpState(session);
    const parsed = JSON.parse(json);
    expect(parsed).toBeDefined();
    expect(parsed.ready).toBe(true);
  });
});
