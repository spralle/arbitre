import type { CompiledRule, TmsConfig } from "./contracts.js";
import type { ScopeManager } from "./scope.js";

// ---------------------------------------------------------------------------
// Truth Maintenance System (ADR §5)
// Auto-retracts rule writes when conditions flip true→false.
// ---------------------------------------------------------------------------

export interface TruthMaintenanceSystem {
  readonly ruleActivated: (rule: CompiledRule) => void;
  readonly ruleDeactivated: (rule: CompiledRule, scope: ScopeManager) => readonly string[];
  readonly shouldTrack: (rule: CompiledRule) => boolean;
  readonly shouldAutoRetract: (path: string, config: TmsConfig) => boolean;
  readonly getActiveRules: () => ReadonlySet<string>;
  readonly removeRule: (ruleName: string) => void;
}

const AUTO_RETRACT_PREFIXES: readonly string[] = ["$ui.", "$contributions."];
const AUTO_RETRACT_BARE: ReadonlySet<string> = new Set(["$ui", "$contributions"]);

function isAutoRetractNamespace(path: string): boolean {
  if (AUTO_RETRACT_BARE.has(path)) return true;
  for (const prefix of AUTO_RETRACT_PREFIXES) {
    if (path.startsWith(prefix)) return true;
  }
  return false;
}

export function createTms(config?: TmsConfig): TruthMaintenanceSystem {
  const activeRules = new Set<string>();
  const resolvedConfig: TmsConfig = { autoRetract: config?.autoRetract ?? "ui-contributions" };

  function shouldTrack(rule: CompiledRule): boolean {
    return rule.hasTms !== false;
  }

  function shouldAutoRetract(path: string, cfg: TmsConfig): boolean {
    const mode = cfg.autoRetract ?? "ui-contributions";
    if (mode === "all") return true;
    return isAutoRetractNamespace(path);
  }

  function ruleActivated(rule: CompiledRule): void {
    if (!shouldTrack(rule)) return;
    activeRules.add(rule.name);
  }

  function ruleDeactivated(rule: CompiledRule, scope: ScopeManager): readonly string[] {
    if (!shouldTrack(rule)) return [];
    if (!activeRules.has(rule.name)) return [];

    activeRules.delete(rule.name);

    const writes = scope.getWriteRecords(rule.name);
    const hasRetractable = writes.some((w) => shouldAutoRetract(w.path, resolvedConfig));
    if (!hasRetractable) return [];

    return scope.revertRule(rule.name);
  }

  function getActiveRules(): ReadonlySet<string> {
    return activeRules;
  }

  function removeRule(ruleName: string): void {
    activeRules.delete(ruleName);
  }

  return {
    ruleActivated,
    ruleDeactivated,
    shouldTrack,
    shouldAutoRetract,
    getActiveRules,
    removeRule,
  };
}
