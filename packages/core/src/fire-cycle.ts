import type { ExprNode } from "kuery";
import { evaluate } from "kuery";
import type { Agenda } from "./agenda.js";
import type { AlphaNetwork } from "./alpha-network.js";
import type {
  ArbiterWarning,
  CompiledRule,
  FiringResult,
  OperatorFunction,
  StateChange,
  ThenOperatorRegistry,
} from "./contracts.js";
import { ArbiterError, ArbiterErrorCode } from "./errors.js";
import type { ScopeManager } from "./scope.js";
import { executeStages } from "./stage-executor.js";
import type { TruthMaintenanceSystem } from "./tms.js";

// ---------------------------------------------------------------------------
// Limits config
// ---------------------------------------------------------------------------

export interface FireLimits {
  readonly maxCycles: number;
  readonly maxRuleFirings: number;
  readonly warnAtCycles: number;
  readonly warnAtFirings: number;
}

// ---------------------------------------------------------------------------
// Subsystem references needed by the fire cycle
// ---------------------------------------------------------------------------

export interface FireContext {
  readonly scope: ScopeManager;
  readonly network: AlphaNetwork;
  readonly agenda: Agenda;
  readonly tms: TruthMaintenanceSystem;
  readonly compiledRules: ReadonlyMap<string, CompiledRule>;
  readonly operators: Readonly<Record<string, OperatorFunction>>;
  readonly limits: FireLimits;
  readonly ruleConditionState: Map<string, boolean>;
  readonly thenOperators?: ThenOperatorRegistry | undefined;
}

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

export function evaluateCondition(rule: CompiledRule, scope: ScopeManager): boolean {
  const state = scope.getReadView();
  const result = evaluate(rule.condition as ExprNode, state);
  return Boolean(result);
}

// ---------------------------------------------------------------------------
// TMS retraction → StateChange conversion
// ---------------------------------------------------------------------------

function buildRetractionChanges(rule: CompiledRule, ctx: FireContext): readonly StateChange[] {
  const revertedPaths = ctx.tms.ruleDeactivated(rule, ctx.scope);
  return revertedPaths.map((path) => ({
    path,
    newValue: ctx.scope.get(path),
    previousValue: undefined,
    ruleName: rule.name,
  }));
}

// ---------------------------------------------------------------------------
// Rule evaluation (single rule)
// ---------------------------------------------------------------------------

export function reevaluateRule(rule: CompiledRule, ctx: FireContext): readonly StateChange[] {
  if (!rule.enabled) return [];
  const wasActive = ctx.ruleConditionState.get(rule.name) ?? false;
  const isActive = evaluateCondition(rule, ctx.scope);
  ctx.ruleConditionState.set(rule.name, isActive);

  if (isActive && !wasActive) {
    ctx.agenda.addActivation(rule);
    ctx.tms.ruleActivated(rule);
  } else if (isActive && wasActive) {
    ctx.agenda.addActivation(rule);
  } else if (!isActive && wasActive) {
    ctx.agenda.removeActivation(rule.name);
    return buildRetractionChanges(rule, ctx);
  }
  return [];
}

// ---------------------------------------------------------------------------
// Evaluate all rules (initial pass)
// ---------------------------------------------------------------------------

export function evaluateAllRules(ctx: FireContext): readonly StateChange[] {
  const retractions: StateChange[] = [];
  for (const rule of ctx.compiledRules.values()) {
    if (!rule.enabled) continue;
    const isActive = evaluateCondition(rule, ctx.scope);
    const wasActive = ctx.ruleConditionState.get(rule.name) ?? false;
    ctx.ruleConditionState.set(rule.name, isActive);

    if (isActive && !wasActive) {
      ctx.agenda.addActivation(rule);
      ctx.tms.ruleActivated(rule);
    } else if (!isActive && wasActive) {
      ctx.agenda.removeActivation(rule.name);
      retractions.push(...buildRetractionChanges(rule, ctx));
    }
  }
  return retractions;
}

// ---------------------------------------------------------------------------
// Execute else actions for initially-false rules
// ---------------------------------------------------------------------------

export function executeElseBranches(ctx: FireContext, changes: StateChange[]): void {
  for (const rule of ctx.compiledRules.values()) {
    if (!rule.enabled || !rule.elseActions) continue;
    const isActive = ctx.ruleConditionState.get(rule.name) ?? false;
    if (!isActive) {
      const elseChanges = executeStages(rule.elseActions, rule.name, ctx);
      changes.push(...elseChanges);
    }
  }
}

// ---------------------------------------------------------------------------
// Propagation: find affected rules and re-evaluate
// ---------------------------------------------------------------------------

function propagateChanges(changes: readonly StateChange[], ctx: FireContext, allChanges: StateChange[]): void {
  const affectedNames = new Set<string>();
  for (const change of changes) {
    for (const rule of ctx.network.getAffectedRules(change.path)) {
      affectedNames.add(rule.name);
    }
  }
  for (const name of affectedNames) {
    const rule = ctx.compiledRules.get(name);
    if (rule?.enabled) {
      const retractions = reevaluateRule(rule, ctx);
      allChanges.push(...retractions);
    }
  }
}

// ---------------------------------------------------------------------------
// Main fire cycle
// ---------------------------------------------------------------------------

export function fireCycle(ctx: FireContext): FiringResult {
  const changes: StateChange[] = [];
  const warnings: ArbiterWarning[] = [];
  let rulesFired = 0;
  let cycles = 0;

  evaluateAllRules(ctx).forEach((c) => {
    changes.push(c);
  });
  executeElseBranches(ctx, changes);

  while (!ctx.agenda.isEmpty()) {
    cycles++;

    if (cycles > ctx.limits.maxCycles) {
      throw new ArbiterError(
        ArbiterErrorCode.CYCLE_LIMIT_EXCEEDED,
        `Cycle limit of ${String(ctx.limits.maxCycles)} exceeded`,
      );
    }
    if (cycles === ctx.limits.warnAtCycles) {
      warnings.push({
        code: ArbiterErrorCode.CYCLE_LIMIT_EXCEEDED,
        message: `Approaching cycle limit (${String(cycles)}/${String(ctx.limits.maxCycles)})`,
      });
    }

    const rule = ctx.agenda.selectNext();
    if (!rule) break;

    const ruleChanges = executeStages(rule.actions, rule.name, ctx);
    changes.push(...ruleChanges);
    rulesFired++;

    if (rulesFired > ctx.limits.maxRuleFirings) {
      throw new ArbiterError(
        ArbiterErrorCode.FIRING_LIMIT_EXCEEDED,
        `Firing limit of ${String(ctx.limits.maxRuleFirings)} exceeded`,
      );
    }
    if (rulesFired === ctx.limits.warnAtFirings) {
      warnings.push({
        code: ArbiterErrorCode.FIRING_LIMIT_EXCEEDED,
        message: `Approaching firing limit (${String(rulesFired)}/${String(ctx.limits.maxRuleFirings)})`,
      });
    }

    propagateChanges(ruleChanges, ctx, changes);
  }

  return { rulesFired, cycles, changes, warnings };
}
