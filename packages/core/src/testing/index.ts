import type { FiringResult, ProductionRule, RuleSession } from "../contracts.js";
import { createSession } from "../session.js";

/** Convenience factory for tests — minimal config. */
export function createTestSession(
  rules: readonly ProductionRule[],
  initialState?: Readonly<Record<string, unknown>>,
): RuleSession {
  return createSession({ rules, initialState });
}

/** Fire rules against state in one call. */
export function fireWith(rules: readonly ProductionRule[], state: Readonly<Record<string, unknown>>): FiringResult {
  const session = createSession({ rules, initialState: state });
  return session.fire();
}

/** Assert that a specific rule fired during the result. Throws if not found. */
export function assertRuleFired(result: FiringResult, ruleName: string): void {
  const found = result.changes.some((c) => c.ruleName === ruleName);
  if (!found) {
    const fired = [...new Set(result.changes.map((c) => c.ruleName))];
    throw new Error(
      `Expected rule "${ruleName}" to fire, but it did not. ` + `Rules that fired: [${fired.join(", ")}]`,
    );
  }
}

/** Assert that a specific rule did NOT fire. Throws if found. */
export function assertRuleNotFired(result: FiringResult, ruleName: string): void {
  const found = result.changes.some((c) => c.ruleName === ruleName);
  if (found) {
    throw new Error(`Expected rule "${ruleName}" NOT to fire, but it did.`);
  }
}

/** Assert a path has a specific value in the session. Deep equality check. */
export function assertState(session: RuleSession, path: string, expected: unknown): void {
  const actual = session.getPath(path);
  if (!deepEqual(actual, expected)) {
    throw new Error(
      `State mismatch at "${path}": ` + `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;

  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => Object.hasOwn(bObj, k) && deepEqual(aObj[k], bObj[k]));
}
