import type { ExprNode } from "kuery";
import { evaluate } from "kuery";
import type { Agenda } from "./agenda.js";
import type { CompiledStage, StateChange, ThenOperatorRegistry } from "./contracts.js";
import { ArbiterError, ArbiterErrorCode } from "./errors.js";
import { isExpression } from "./path-utils.js";
import type { ScopeManager } from "./scope.js";

// ---------------------------------------------------------------------------
// Expression value resolution
// ---------------------------------------------------------------------------

const NAMESPACE_PREFIXES = ["$ui", "$state", "$meta", "$contributions"];

function isNamespacedRef(ref: string): boolean {
  for (const ns of NAMESPACE_PREFIXES) {
    if (ref === ns || ref.startsWith(`${ns}.`)) return true;
  }
  return false;
}

export function resolveValue(value: unknown, scope: ScopeManager): unknown {
  if (typeof value === "string" && value.startsWith("$")) {
    const ref = value.slice(1);
    const path = isNamespacedRef(`$${ref}`) ? `$${ref}` : ref;
    return scope.get(path);
  }
  if (isExpression(value)) {
    return evaluateExpression(value as Record<string, unknown>, scope);
  }
  return value;
}

function evaluateExpression(expr: Record<string, unknown>, scope: ScopeManager): unknown {
  const keys = Object.keys(expr);
  const opKey = keys.find((k) => k.startsWith("$"));
  if (!opKey) return expr;

  const rawArgs = expr[opKey];
  const args = Array.isArray(rawArgs)
    ? (rawArgs as unknown[]).map((a) => resolveValue(a, scope))
    : [resolveValue(rawArgs, scope)];

  return evaluateOperatorInline(opKey, args);
}

function evaluateOperatorInline(op: string, args: unknown[]): unknown {
  switch (op) {
    case "$sum": {
      let total = 0;
      for (const v of args) {
        if (typeof v === "number") total += v;
      }
      return total;
    }
    case "$multiply": {
      let result = 1;
      for (const v of args) {
        if (typeof v !== "number") return null;
        result *= v;
      }
      return result;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Stage execution context (subset of FireContext needed here)
// ---------------------------------------------------------------------------

export interface StageExecContext {
  readonly scope: ScopeManager;
  readonly agenda: Agenda;
  readonly thenOperators?: ThenOperatorRegistry | undefined;
}

// ---------------------------------------------------------------------------
// Execute a list of compiled stages
// ---------------------------------------------------------------------------

export function executeStages(
  stages: readonly CompiledStage[],
  ruleName: string,
  ctx: StageExecContext,
): StateChange[] {
  const changes: StateChange[] = [];
  for (const stage of stages) {
    const stageChanges = executeSingleStage(stage, ruleName, ctx);
    changes.push(...stageChanges);
  }
  return changes;
}

function executeSingleStage(stage: CompiledStage, ruleName: string, ctx: StageExecContext): StateChange[] {
  switch (stage.operator) {
    case "$set":
      return executeSet(stage.entries, ruleName, ctx);
    case "$unset":
      return executeUnset(stage.entries, ruleName, ctx);
    case "$inc":
      return executeInc(stage.entries, ruleName, ctx);
    case "$push":
      return executePush(stage.entries, ruleName, ctx);
    case "$pull":
      return executePull(stage.entries, ruleName, ctx);
    case "$merge":
      return executeMerge(stage.entries, ruleName, ctx);
    case "$focus":
      return executeFocus(stage.entries, ctx);
    default:
      return executeCustomOperator(stage, ruleName, ctx);
  }
}

function executeSet(entries: ReadonlyMap<string, unknown>, ruleName: string, ctx: StageExecContext): StateChange[] {
  const changes: StateChange[] = [];
  for (const [path, compiledValue] of entries) {
    const value = resolveValue(compiledValue, ctx.scope);
    const prev = ctx.scope.get(path);
    ctx.scope.set(path, value, ruleName);
    changes.push({ path, previousValue: prev, newValue: value, ruleName });
  }
  return changes;
}

function executeUnset(entries: ReadonlyMap<string, unknown>, ruleName: string, ctx: StageExecContext): StateChange[] {
  const changes: StateChange[] = [];
  for (const [path] of entries) {
    const prev = ctx.scope.get(path);
    ctx.scope.unset(path, ruleName);
    changes.push({ path, previousValue: prev, newValue: undefined, ruleName });
  }
  return changes;
}

function executeInc(entries: ReadonlyMap<string, unknown>, ruleName: string, ctx: StageExecContext): StateChange[] {
  const changes: StateChange[] = [];
  for (const [path, compiledValue] of entries) {
    const value = resolveValue(compiledValue, ctx.scope);
    const prev = ctx.scope.get(path);
    ctx.scope.inc(path, value, ruleName);
    const newVal = ctx.scope.get(path);
    changes.push({ path, previousValue: prev, newValue: newVal, ruleName });
  }
  return changes;
}

function executePush(entries: ReadonlyMap<string, unknown>, ruleName: string, ctx: StageExecContext): StateChange[] {
  const changes: StateChange[] = [];
  for (const [path, compiledValue] of entries) {
    const value = resolveValue(compiledValue, ctx.scope);
    const prev = ctx.scope.get(path);
    ctx.scope.push(path, value, ruleName);
    const newVal = ctx.scope.get(path);
    changes.push({ path, previousValue: prev, newValue: newVal, ruleName });
  }
  return changes;
}

function executePull(entries: ReadonlyMap<string, unknown>, ruleName: string, ctx: StageExecContext): StateChange[] {
  const changes: StateChange[] = [];
  for (const [path, compiledMatch] of entries) {
    const prev = ctx.scope.get(path);
    if (!Array.isArray(prev)) continue;
    const filtered = prev.filter((item) => !evaluate(compiledMatch as ExprNode, item as Record<string, unknown>));
    ctx.scope.set(path, filtered, ruleName);
    changes.push({ path, previousValue: prev, newValue: filtered, ruleName });
  }
  return changes;
}

function executeMerge(entries: ReadonlyMap<string, unknown>, ruleName: string, ctx: StageExecContext): StateChange[] {
  const changes: StateChange[] = [];
  for (const [path, compiledValue] of entries) {
    const value = resolveValue(compiledValue, ctx.scope);
    const prev = ctx.scope.get(path);
    ctx.scope.merge(path, value, ruleName);
    const newVal = ctx.scope.get(path);
    changes.push({ path, previousValue: prev, newValue: newVal, ruleName });
  }
  return changes;
}

function executeFocus(entries: ReadonlyMap<string, unknown>, ctx: StageExecContext): StateChange[] {
  const group = entries.get("group") as string;
  ctx.agenda.setFocus(group);
  return [];
}

function executeCustomOperator(stage: CompiledStage, ruleName: string, ctx: StageExecContext): StateChange[] {
  const registry = ctx.thenOperators;
  if (!registry) {
    throw new ArbiterError(
      ArbiterErrorCode.RULE_COMPILATION_FAILED,
      `Unknown then operator "${stage.operator}" and no operator registry configured`,
    );
  }
  const handler = registry.get(stage.operator);
  if (!handler) {
    throw new ArbiterError(ArbiterErrorCode.RULE_COMPILATION_FAILED, `Unknown then operator "${stage.operator}"`);
  }
  const changes: StateChange[] = [];
  const scope = ctx.scope.getReadView();
  handler(stage.entries, scope, (path, value) => {
    const prev = ctx.scope.get(path);
    ctx.scope.set(path, value, ruleName);
    changes.push({ path, previousValue: prev, newValue: value, ruleName });
  });
  return changes;
}
