import { createAgenda } from "./agenda.js";
import { createAlphaNetwork } from "./alpha-network.js";
import type {
  CompiledRule,
  FiringResult,
  ProductionRule,
  RuleSession,
  SessionConfig,
  SubscriptionCallback,
  Unsubscribe,
} from "./contracts.js";
import { ArbiterError, ArbiterErrorCode } from "./errors.js";
import { createOperatorRegistry } from "./expression-operators.js";
import type { FireContext, FireLimits } from "./fire-cycle.js";
import { fireCycle } from "./fire-cycle.js";
import { validatePath } from "./path-utils.js";
import { compileRule } from "./rule-compiler.js";
import { createScopeManager } from "./scope.js";
import { createTms } from "./tms.js";

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSession<TState = Record<string, unknown>>(config?: SessionConfig<TState>): RuleSession<TState> {
  const scope = createScopeManager(config?.initialState);
  const network = createAlphaNetwork();
  const agenda = createAgenda();
  const tms = createTms(config?.tms);
  const operators = createOperatorRegistry(config?.operators?.custom);

  const compiledRules = new Map<string, CompiledRule>();
  const subscriptions = new Map<string, Set<SubscriptionCallback>>();
  const ruleConditionState = new Map<string, boolean>();
  let disposed = false;

  const limits: FireLimits = {
    maxCycles: config?.limits?.maxCycles ?? 100,
    maxRuleFirings: config?.limits?.maxRuleFirings ?? 1000,
    warnAtCycles: config?.limits?.warnAtCycles ?? 80,
    warnAtFirings: config?.limits?.warnAtFirings ?? 800,
  };

  for (const rule of config?.rules ?? []) {
    registerRuleInternal(rule);
  }

  function assertNotDisposed(): void {
    if (disposed) {
      throw new ArbiterError(ArbiterErrorCode.SESSION_DISPOSED, "Session has been disposed");
    }
  }

  function buildContext(): FireContext {
    const ctx: FireContext = {
      scope,
      network,
      agenda,
      tms,
      compiledRules,
      operators,
      limits,
      ruleConditionState,
    };
    if (config?.thenOperators) {
      return { ...ctx, thenOperators: config.thenOperators };
    }
    return ctx;
  }

  function registerRuleInternal(rule: ProductionRule<TState>): void {
    const compiled = compileRule(rule as ProductionRule<unknown>);
    compiledRules.set(compiled.name, compiled);
    network.addRule(compiled);
  }

  function registerRule(rule: ProductionRule<TState>): void {
    assertNotDisposed();
    registerRuleInternal(rule);
  }

  function removeRule(name: string): void {
    assertNotDisposed();
    const compiled = compiledRules.get(name);
    if (!compiled) return;
    network.removeRule(name);
    agenda.removeActivation(name);
    tms.removeRule(name);
    scope.revertRule(name);
    scope.clearWriteRecords(name);
    ruleConditionState.delete(name);
    compiledRules.delete(name);
  }

  function assertPath(path: string, value: unknown): void {
    assertNotDisposed();
    validatePath(path);
    scope.set(path, value, "__assert__");
  }

  function retract(path: string): void {
    assertNotDisposed();
    validatePath(path);
    scope.unset(path, "__assert__");
  }

  function fire(): FiringResult {
    assertNotDisposed();
    const ctx = buildContext();
    const result = fireCycle(ctx);
    notifySubscribers(result.changes);
    return result;
  }

  function notifySubscribers(changes: readonly { path: string; newValue: unknown; previousValue: unknown }[]): void {
    for (const change of changes) {
      const callbacks = subscriptions.get(change.path);
      if (!callbacks) continue;
      for (const cb of callbacks) {
        cb(change.newValue, change.previousValue);
      }
    }
  }

  function subscribe(path: string, callback: SubscriptionCallback): Unsubscribe {
    assertNotDisposed();
    let set = subscriptions.get(path);
    if (!set) {
      set = new Set();
      subscriptions.set(path, set);
    }
    set.add(callback);
    return () => {
      set.delete(callback);
    };
  }

  function update(path: string, value: unknown): FiringResult {
    assertPath(path, value);
    return fire();
  }

  function getState(): Readonly<Record<string, unknown>> {
    assertNotDisposed();
    return scope.getState();
  }

  function getPath(path: string): unknown {
    assertNotDisposed();
    return scope.get(path);
  }

  function setFocus(group: string): void {
    assertNotDisposed();
    agenda.setFocus(group);
  }

  function dispose(): void {
    disposed = true;
    compiledRules.clear();
    subscriptions.clear();
    ruleConditionState.clear();
  }

  return {
    registerRule,
    removeRule,
    assert: assertPath,
    retract,
    fire,
    subscribe,
    update,
    getState,
    getPath,
    setFocus,
    dispose,
  };
}
