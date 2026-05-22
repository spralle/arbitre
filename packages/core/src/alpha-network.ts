import type { CompiledRule } from "./contracts.js";
import { extractActionDeps, extractConditionDeps } from "./dependency-extract.js";
import { isWildcardPath, matchWildcardPath } from "./path-utils.js";

export interface AlphaNetwork {
  readonly getAffectedRules: (changedPath: string) => readonly CompiledRule[];
  readonly addRule: (rule: CompiledRule) => void;
  readonly removeRule: (ruleName: string) => void;
  readonly getRuleDeps: (ruleName: string) => readonly string[];
}

interface WildcardEntry {
  readonly pattern: string;
  readonly rule: CompiledRule;
}

export function createAlphaNetwork(): AlphaNetwork {
  const exactIndex = new Map<string, Set<CompiledRule>>();
  const wildcardEntries: WildcardEntry[] = [];
  const ruleDeps = new Map<string, readonly string[]>();
  const rulesByName = new Map<string, CompiledRule>();

  function addRule(rule: CompiledRule): void {
    const condDeps = extractConditionDeps(rule.condition);
    const actionDeps = extractActionDeps(rule.actions);
    const allDeps = [...new Set([...condDeps, ...actionDeps])];

    ruleDeps.set(rule.name, allDeps);
    rulesByName.set(rule.name, rule);

    for (const dep of condDeps) {
      if (isWildcardPath(dep)) {
        wildcardEntries.push({ pattern: dep, rule });
      } else {
        let set = exactIndex.get(dep);
        if (!set) {
          set = new Set();
          exactIndex.set(dep, set);
        }
        set.add(rule);
      }
    }
  }

  function removeRule(ruleName: string): void {
    const rule = rulesByName.get(ruleName);
    if (!rule) return;

    rulesByName.delete(ruleName);
    ruleDeps.delete(ruleName);

    for (const set of exactIndex.values()) {
      set.delete(rule);
    }

    // Remove wildcard entries for this rule (iterate backwards for safe splice)
    for (let i = wildcardEntries.length - 1; i >= 0; i--) {
      if (wildcardEntries[i].pattern !== undefined && wildcardEntries[i].rule === rule) {
        wildcardEntries.splice(i, 1);
      }
    }
  }

  function getAffectedRules(changedPath: string): readonly CompiledRule[] {
    const result = new Set<CompiledRule>();

    const exactSet = exactIndex.get(changedPath);
    if (exactSet) {
      for (const rule of exactSet) {
        result.add(rule);
      }
    }

    for (const entry of wildcardEntries) {
      if (matchWildcardPath(entry.pattern, changedPath)) {
        result.add(entry.rule);
      }
    }

    return [...result];
  }

  function getRuleDeps(ruleName: string): readonly string[] {
    return ruleDeps.get(ruleName) ?? [];
  }

  return { getAffectedRules, addRule, removeRule, getRuleDeps };
}
