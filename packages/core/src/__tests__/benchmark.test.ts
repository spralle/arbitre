import { describe, expect, it } from "vitest";
import type { ProductionRule } from "../contracts.js";
import { createSession } from "../session.js";

// ---------------------------------------------------------------------------
// Performance benchmarks (ADR §18)
// Thresholds are 10x the ADR aspirational targets to avoid CI flakiness.
// ---------------------------------------------------------------------------

describe("Benchmarks", () => {
  it("50-rule form fires in < 50ms", () => {
    const rules: ProductionRule[] = Array.from({ length: 50 }, (_, i) => ({
      name: `field-${i}-visibility`,
      when: { [`field${i}`]: { $exists: true } },
      then: [{ $set: { [`$ui.field${i}.visible`]: true } }],
    }));

    const initialState: Record<string, unknown> = {};
    for (let i = 0; i < 50; i++) {
      initialState[`field${i}`] = `value${i}`;
    }

    const session = createSession({ rules, initialState });

    const start = performance.now();
    const result = session.fire();
    const elapsed = performance.now() - start;

    expect(result.rulesFired).toBe(50);
    expect(elapsed).toBeLessThan(50);
    console.log(`50-rule fire: ${elapsed.toFixed(2)}ms`);
  });

  it("200-rule contributions fire in < 100ms", () => {
    const rules: ProductionRule[] = Array.from({ length: 200 }, (_, i) => ({
      name: `contribution-${i}`,
      when: { context: "active" },
      then: [{ $set: { [`$contributions.action${i}.visible`]: true } }],
    }));

    const session = createSession({
      rules,
      initialState: { context: "active" },
      limits: { maxCycles: 500, maxRuleFirings: 5000 },
    });

    const start = performance.now();
    const result = session.fire();
    const elapsed = performance.now() - start;

    expect(result.rulesFired).toBe(200);
    expect(elapsed).toBeLessThan(100);
    console.log(`200-rule fire: ${elapsed.toFixed(2)}ms`);
  });

  it("1000 field updates in < 500ms", () => {
    const session = createSession({
      initialState: { counter: 0 },
      rules: [
        {
          name: "counter-display",
          when: { counter: { $exists: true } },
          then: [{ $set: { "$ui.counterDisplay.value": "$counter" } }],
        },
      ],
    });
    session.fire();

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      session.update("counter", i);
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(500);
    console.log(`1000 updates: ${elapsed.toFixed(2)}ms`);
  });
});
