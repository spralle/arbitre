import { createAccumulateManager } from "./accumulate-manager.js";
import { createAgenda } from "./agenda.js";
import { createAlphaNetwork } from "./alpha-network.js";
import { createBetaEvaluator } from "./beta-evaluator.js";
import type { Token } from "./beta-node.js";
import type {
	CompiledRule,
	FiringResult,
	ProductionRule,
	RuleSession,
	SessionConfig,
	SubscriptionCallback,
	Unsubscribe,
} from "./contracts.js";
import type { CrossTypeAccumulator } from "./cross-type-accumulate.js";
import { createCrossTypeAccumulator } from "./cross-type-accumulate.js";
import { ArbiterError, ArbiterErrorCode } from "./errors.js";
import type { ExpiryTracker } from "./expiry-tracker.js";
import { createExpiryTracker } from "./expiry-tracker.js";
import { createOperatorRegistry } from "./expression-operators.js";
import { createFactMemory } from "./fact-memory.js";
import { createFactRegistry } from "./fact-registry.js";
import type { FireContext, FireLimits } from "./fire-cycle.js";
import { evaluateCondition, fireCycle } from "./fire-cycle.js";
import { emitHook } from "./hooks.js";
import type { SessionIntrospection, SessionMetrics } from "./introspection.js";
import { nullLogger } from "./logger.js";
import { validatePath } from "./path-utils.js";
import { compileRule } from "./rule-compiler.js";
import { createScopeManager } from "./scope.js";
import { createAssertFact, createGetFacts, createRetractFact } from "./session-facts.js";
import { createCancelSchedule, createScheduleRule, createTick } from "./session-temporal.js";
import { TEMPORAL_OPERATORS } from "./temporal-operators.js";
import { createTimerQueue } from "./timer-queue.js";
import { createTms } from "./tms.js";

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createSession<TState = Record<string, unknown>>(config?: SessionConfig<TState>): RuleSession<TState> {
	// Extract namespace names and build auto-retract set
	const namespaceNames = config?.namespaces?.map((ns) => ns.name) ?? [];
	const autoRetractNamespaces = new Set(
		(config?.namespaces ?? []).filter((ns) => ns.autoRetract !== false).map((ns) => ns.name),
	);

	const scope = createScopeManager(config?.initialState, namespaceNames);
	const network = createAlphaNetwork();
	const agenda = createAgenda();
	const tms = createTms(config?.tms, autoRetractNamespaces);
	const customOps = config?.clock ? { ...TEMPORAL_OPERATORS, ...config?.operators?.custom } : config?.operators?.custom;
	const operators = createOperatorRegistry(customOps);

	// Fact support (optional — only active when factTypes provided)
	const factTypesConfig = config?.factTypes;
	const factRegistry = factTypesConfig ? createFactRegistry() : undefined;
	const factMemory = factTypesConfig ? createFactMemory() : undefined;
	const betaEvaluator = createBetaEvaluator();
	const customFnNameSet: ReadonlySet<string> | undefined = config?.accumulateFunctions
		? new Set(Object.keys(config.accumulateFunctions))
		: undefined;

	if (factRegistry && factTypesConfig) {
		for (const def of factTypesConfig) {
			factRegistry.register(def);
		}
	}

	// Accumulate support (optional — lazily created if rules declare inline accumulates)
	const singleTypeAccumulates = config?.accumulates?.filter((c) => !c.binding || !c.rule);
	let accumulateManager = singleTypeAccumulates?.length
		? createAccumulateManager(singleTypeAccumulates, config?.accumulateFunctions, config?.clock)
		: undefined;

	// Cross-type accumulate support (join-scoped aggregation)
	let crossTypeAccumulator: CrossTypeAccumulator | undefined = config?.accumulates?.length
		? createCrossTypeAccumulator(config.accumulates, config.accumulateFunctions)
		: undefined;

	function syncAggregates(): void {
		const agg: Record<string, unknown> = {};
		if (accumulateManager) {
			Object.assign(agg, accumulateManager.getAggregates());
		}
		if (crossTypeAccumulator) {
			Object.assign(agg, crossTypeAccumulator.getValues());
		}
		if (Object.keys(agg).length > 0) {
			scope.set("$aggregates", agg, "__accumulate__");
		}
	}

	const compiledRules = new Map<string, CompiledRule>();
	const subscriptions = new Map<string, Set<SubscriptionCallback>>();
	const ruleConditionState = new Map<string, boolean>();
	const pendingTokens = new Map<string, Token>();
	const elseTracking = { wasActive: new Set<string>(), elseFired: new Set<string>() };
	let disposed = false;
	let firing = false;

	const hooks = config?.hooks;
	const logger = config?.logger ?? nullLogger;
	const metrics: {
		totalRulesFired: number;
		totalCycles: number;
		totalFactsAsserted: number;
		totalFactsRetracted: number;
	} = {
		totalRulesFired: 0,
		totalCycles: 0,
		totalFactsAsserted: 0,
		totalFactsRetracted: 0,
	};

	const clock = config?.clock;
	const timerQueue = clock ? createTimerQueue() : undefined;

	// Expiry tracker: only created when clock exists and rules have expires
	const expiryMap = new Map<string, number>();
	for (const rule of config?.rules ?? []) {
		if (rule.expires !== undefined) {
			expiryMap.set(rule.name, rule.expires);
		}
	}
	const expiryTracker: ExpiryTracker | undefined =
		clock && expiryMap.size > 0 ? createExpiryTracker(expiryMap) : undefined;

	function injectClockTime(): void {
		if (clock) {
			scope.set("$meta.$now", clock.now(), "__clock__");
		}
	}

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
			pendingTokens,
			elseTracking,
			hooks,
			logger,
		};
		if (config?.thenOperators) {
			return { ...ctx, thenOperators: config.thenOperators };
		}
		return ctx;
	}

	function registerRuleInternal(rule: ProductionRule<TState>): void {
		const compiled = compileRule(rule as ProductionRule<unknown>, customFnNameSet);
		compiledRules.set(compiled.name, compiled);
		network.addRule(compiled);

		if (rule.expires !== undefined) {
			expiryMap.set(rule.name, rule.expires);
		}

		if (compiled.hasPatterns && compiled.patterns) {
			const sourcePatterns = rule.patterns ?? [];
			betaEvaluator.registerRule(compiled.name, sourcePatterns);
		}

		if (compiled.accumulates?.length) {
			if (!accumulateManager) {
				accumulateManager = createAccumulateManager([], config?.accumulateFunctions, clock);
			}
			if (!crossTypeAccumulator) {
				crossTypeAccumulator = createCrossTypeAccumulator([], config?.accumulateFunctions);
			}
			for (const acc of compiled.accumulates) {
				accumulateManager.addConfig(acc);
			}
		}
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
		betaEvaluator.removeRule(name);
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
		if (firing) {
			throw new ArbiterError(
				ArbiterErrorCode.REENTRANT_FIRE,
				"Cannot call fire() or update() while a fire cycle is in progress (e.g., from a subscribe callback)",
			);
		}
		firing = true;
		try {
			injectClockTime();
			const ctx = buildContext();
			const stateSnapshot = scope.snapshot();
			let result: FiringResult;
			try {
				result = fireCycle(ctx);
			} catch (e) {
				if (
					e instanceof ArbiterError &&
					(e.code === ArbiterErrorCode.CYCLE_LIMIT_EXCEEDED || e.code === ArbiterErrorCode.FIRING_LIMIT_EXCEEDED)
				) {
					scope.restore(stateSnapshot);
				}
				throw e;
			}
			if (expiryTracker && clock) {
				for (const ruleName of expiryMap.keys()) {
					const isActive = ruleConditionState.get(ruleName) ?? false;
					if (!isActive) {
						expiryTracker.reset(ruleName);
					}
				}
				for (const change of result.changes) {
					if (expiryMap.has(change.ruleName)) {
						expiryTracker.onRuleActivated(change.ruleName, clock.now());
					}
				}
			}
			trackPatternRuleProvenance(result);
			notifySubscribers(result.changes);
			metrics.totalRulesFired += result.rulesFired;
			metrics.totalCycles += result.cycles;
			return result;
		} finally {
			firing = false;
		}
	}

	function trackPatternRuleProvenance(result: FiringResult): void {
		for (const change of result.changes) {
			const rule = compiledRules.get(change.ruleName);
			if (!rule?.hasPatterns) continue;
			const tokens = betaEvaluator.getTokensForRule(rule.name);
			const factIds = new Set<string>();
			for (const token of tokens) {
				for (const fact of Object.values(token.factBindings)) {
					factIds.add(fact.id);
				}
			}
			if (factIds.size > 0) {
				tms.recordFactDependency(rule.name, [...factIds]);
			}
		}
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

	const autoFire = config?.autoFireOnFactChange !== false;

	// Fact operations (extracted to session-facts.ts)
	const factDeps = {
		assertNotDisposed,
		factRegistry,
		factMemory,
		accumulateManager,
		crossTypeAccumulator,
		betaEvaluator,
		scope,
		compiledRules,
		agenda,
		tms,
		pendingTokens,
		syncAggregates,
		evaluateCondition,
		autoFire,
		fire,
	};
	const assertFactBase = createAssertFact(factDeps);
	const retractFactBase = createRetractFact(factDeps);
	const getFacts = createGetFacts(factDeps);

	function assertFact(type: string, data: Readonly<Record<string, unknown>>): string {
		const id = assertFactBase(type, data);
		metrics.totalFactsAsserted++;
		emitHook(hooks, "onFactAsserted", { factId: id, factType: type, data });
		return id;
	}

	function retractFact(id: string): boolean {
		const fact = factMemory?.getFact(id);
		const result = retractFactBase(id);
		if (result && fact) {
			metrics.totalFactsRetracted++;
			emitHook(hooks, "onFactRetracted", { factId: id, factType: fact.type });
		}
		return result;
	}

	// Temporal operations (extracted to session-temporal.ts)
	const temporalDeps = {
		assertNotDisposed,
		clock,
		timerQueue,
		expiryTracker,
		accumulateManager,
		scope,
		compiledRules,
		agenda,
		ruleConditionState,
		syncAggregates,
		fire,
	};
	const tick = createTick(temporalDeps);
	const scheduleRule = createScheduleRule(temporalDeps);
	const cancelSchedule = createCancelSchedule(temporalDeps);

	const introspect: SessionIntrospection = {
		getAgendaEntries: () => agenda.getActivations().map((a) => a.rule.name),
		getRegisteredRules: () => [...compiledRules.keys()],
		getActiveRules: () => {
			const active: string[] = [];
			for (const [name, isActive] of ruleConditionState) {
				if (isActive) active.push(name);
			}
			return active;
		},
		getFactCounts: () => {
			if (!factMemory) return {};
			const counts: Record<string, number> = {};
			const factTypesArr = config?.factTypes ?? [];
			for (const def of factTypesArr) {
				const facts = factMemory.getFactsByType(def.name);
				if (facts.length > 0) counts[def.name] = facts.length;
			}
			return counts;
		},
		getTokenCounts: () => {
			const counts: Record<string, number> = {};
			for (const name of compiledRules.keys()) {
				const tokens = betaEvaluator.getTokensForRule(name);
				if (tokens.length > 0) counts[name] = tokens.length;
			}
			return counts;
		},
		getMetrics: () => ({ ...metrics }),
	};

	function checkpoint(): unknown {
		assertNotDisposed();
		return {
			scope: scope.snapshot(),
			ruleConditionState: new Map(ruleConditionState),
		};
	}

	function rollback(snapshot: unknown): void {
		assertNotDisposed();
		const snap = snapshot as { scope: unknown; ruleConditionState: Map<string, boolean> };
		scope.restore(snap.scope);
		ruleConditionState.clear();
		for (const [key, val] of snap.ruleConditionState) {
			ruleConditionState.set(key, val);
		}
		agenda.clear();
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
		assertFact,
		retractFact,
		getFacts,
		tick,
		scheduleRule,
		cancelSchedule,
		introspect,
		checkpoint,
		rollback,
	};
}
