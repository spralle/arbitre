// ---------------------------------------------------------------------------
// Accumulate node — maintains running aggregates over typed facts (L2).
// ---------------------------------------------------------------------------

import { getAccumulateFn } from "./accumulate-functions.js";
import type { Fact } from "./fact-memory.js";

export interface AccumulateConfig {
  readonly factType: string;
  readonly field: string;
  readonly fn: string;
  readonly alias: string;
  readonly filter?: Record<string, unknown> | undefined;
}

export interface AccumulateNode {
  readonly config: AccumulateConfig;
  readonly addFact: (fact: Fact) => void;
  readonly removeFact: (fact: Fact) => void;
  readonly getValue: () => number | null;
  readonly recompute: (facts: readonly Fact[]) => void;
  readonly reset: () => void;
  readonly getTrackedFactIds: () => readonly string[];
}

function matchesFilter(data: Readonly<Record<string, unknown>>, filter: Record<string, unknown>): boolean {
  for (const key of Object.keys(filter)) {
    if (data[key] !== filter[key]) return false;
  }
  return true;
}

function matchesFact(fact: Fact, config: AccumulateConfig): boolean {
  if (fact.type !== config.factType) return false;
  if (config.filter && !matchesFilter(fact.data, config.filter)) return false;
  return true;
}

function extractValue(fact: Fact, field: string): number | undefined {
  const raw = fact.data[field];
  return typeof raw === "number" ? raw : undefined;
}

export function createAccumulateNode(config: AccumulateConfig): AccumulateNode {
  const aggFn = getAccumulateFn(config.fn);
  const tracked = new Map<string, number>();
  const isCount = config.fn === "$count";

  const addFact = (fact: Fact): void => {
    if (!matchesFact(fact, config)) return;
    if (isCount) {
      tracked.set(fact.id, 0);
      return;
    }
    const value = extractValue(fact, config.field);
    if (value === undefined) return;
    tracked.set(fact.id, value);
  };

  const removeFact = (fact: Fact): void => {
    tracked.delete(fact.id);
  };

  const getValue = (): number | null => {
    return aggFn([...tracked.values()]);
  };

  const recompute = (facts: readonly Fact[]): void => {
    tracked.clear();
    for (const fact of facts) {
      addFact(fact);
    }
  };

  const reset = (): void => {
    tracked.clear();
  };

  const getTrackedFactIds = (): readonly string[] => {
    return [...tracked.keys()];
  };

  return { config, addFact, removeFact, getValue, recompute, reset, getTrackedFactIds };
}
