import type { CompiledRule } from "./contracts.js";

export interface Activation {
  readonly rule: CompiledRule;
  readonly timestamp: number;
  readonly specificity: number;
}

export interface Agenda {
  readonly addActivation: (rule: CompiledRule) => void;
  readonly removeActivation: (ruleName: string) => void;
  readonly selectNext: () => CompiledRule | undefined;
  readonly isEmpty: () => boolean;
  readonly setFocus: (group: string) => void;
  readonly getFocusGroup: () => string | undefined;
  readonly clearFocus: () => void;
  readonly getActivations: () => readonly Activation[];
  readonly size: () => number;
}

function computeSpecificity(rule: CompiledRule): number {
  const source = rule.source;
  if (source.when && typeof source.when === "object") {
    return Object.keys(source.when).length;
  }
  return 1;
}

function compareActivations(a: Activation, b: Activation): number {
  const salDiff = b.rule.salience - a.rule.salience;
  if (salDiff !== 0) return salDiff;
  const recDiff = b.timestamp - a.timestamp;
  if (recDiff !== 0) return recDiff;
  return b.specificity - a.specificity;
}

export function createAgenda(): Agenda {
  let activations: Activation[] = [];
  let counter = 0;
  const focusStack: string[] = [];

  const addActivation = (rule: CompiledRule): void => {
    const existing = activations.findIndex((a) => a.rule.name === rule.name);
    if (existing !== -1) {
      activations.splice(existing, 1);
    }
    const activation: Activation = {
      rule,
      timestamp: ++counter,
      specificity: computeSpecificity(rule),
    };
    // Binary search for sorted insertion position
    let lo = 0;
    let hi = activations.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (compareActivations(activations[mid]!, activation) <= 0) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    activations.splice(lo, 0, activation);
  };

  const removeActivation = (ruleName: string): void => {
    activations = activations.filter((a) => a.rule.name !== ruleName);
  };

  const isEligible = (activation: Activation): boolean => {
    if (focusStack.length === 0) return true;
    const topGroup = focusStack[focusStack.length - 1];
    return activation.rule.activationGroup === undefined || activation.rule.activationGroup === topGroup;
  };

  const selectNext = (): CompiledRule | undefined => {
    const idx = activations.findIndex(isEligible);
    if (idx === -1) return undefined;
    const [selected] = activations.splice(idx, 1);
    return selected.rule;
  };

  const isEmpty = (): boolean => activations.length === 0;

  const setFocus = (group: string): void => {
    focusStack.push(group);
  };

  const getFocusGroup = (): string | undefined =>
    focusStack.length > 0 ? focusStack[focusStack.length - 1] : undefined;

  const clearFocus = (): void => {
    focusStack.length = 0;
  };

  const getActivations = (): readonly Activation[] => [...activations];

  const size = (): number => activations.length;

  return {
    addActivation,
    removeActivation,
    selectNext,
    isEmpty,
    setFocus,
    getFocusGroup,
    clearFocus,
    getActivations,
    size,
  };
}
