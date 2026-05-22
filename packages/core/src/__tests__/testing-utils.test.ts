import { describe, expect, it } from "vitest";
import type { ProductionRule } from "../contracts.js";
import { assertRuleFired, assertRuleNotFired, assertState, createTestSession, fireWith } from "../testing/index.js";

const setVisibleRule: ProductionRule = {
  name: "set-visible",
  when: { type: "hazmat" },
  then: [{ $set: { "$ui.warning": true } }],
};

const noopRule: ProductionRule = {
  name: "noop-rule",
  when: { type: "nope" },
  then: [{ $set: { "$ui.other": true } }],
};

describe("createTestSession", () => {
  it("creates a working session", () => {
    const session = createTestSession([setVisibleRule], { type: "hazmat" });
    const result = session.fire();
    expect(result.rulesFired).toBeGreaterThan(0);
  });
});

describe("fireWith", () => {
  it("returns correct FiringResult", () => {
    const result = fireWith([setVisibleRule], { type: "hazmat" });
    expect(result.rulesFired).toBeGreaterThan(0);
    expect(result.changes.length).toBeGreaterThan(0);
  });
});

describe("assertRuleFired", () => {
  it("passes when rule did fire", () => {
    const result = fireWith([setVisibleRule], { type: "hazmat" });
    expect(() => assertRuleFired(result, "set-visible")).not.toThrow();
  });

  it("throws when rule did not fire", () => {
    const result = fireWith([noopRule], { type: "hazmat" });
    expect(() => assertRuleFired(result, "noop-rule")).toThrow(/Expected rule "noop-rule" to fire/);
  });
});

describe("assertRuleNotFired", () => {
  it("passes when rule did not fire", () => {
    const result = fireWith([noopRule], { type: "hazmat" });
    expect(() => assertRuleNotFired(result, "noop-rule")).not.toThrow();
  });

  it("throws when rule did fire", () => {
    const result = fireWith([setVisibleRule], { type: "hazmat" });
    expect(() => assertRuleNotFired(result, "set-visible")).toThrow(/Expected rule "set-visible" NOT to fire/);
  });
});

describe("assertState", () => {
  it("passes on matching value", () => {
    const session = createTestSession([setVisibleRule], { type: "hazmat" });
    session.fire();
    expect(() => assertState(session, "$ui.warning", true)).not.toThrow();
  });

  it("throws on mismatching value", () => {
    const session = createTestSession([setVisibleRule], { type: "hazmat" });
    session.fire();
    expect(() => assertState(session, "$ui.warning", false)).toThrow(/State mismatch/);
  });
});
