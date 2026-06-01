import type { ArbiterClock, VirtualClock } from "./clock.js";
import type { CompiledRule, FiringResult } from "./contracts.js";
import { ArbiterError, ArbiterErrorCode } from "./errors.js";
import type { ExpiryTracker } from "./expiry-tracker.js";
import type { ScheduleOptions } from "./timer-queue.js";

// ---------------------------------------------------------------------------
// Types for dependency injection from the session
// ---------------------------------------------------------------------------

export interface TemporalSessionDeps {
	readonly assertNotDisposed: () => void;
	readonly clock: ArbiterClock | undefined;
	readonly timerQueue:
		| {
				advanceDueTimers(now: number): readonly string[];
				schedule(ruleName: string, options: ScheduleOptions, now: number): void;
				cancel(ruleName: string): void;
		  }
		| undefined;
	readonly expiryTracker: ExpiryTracker | undefined;
	readonly accumulateManager: { evict(now: number): boolean } | undefined;
	readonly scope: { revertRule(name: string): void; clearWriteRecords(name: string): void };
	readonly compiledRules: Map<string, CompiledRule>;
	readonly agenda: { addActivation(rule: CompiledRule): void; removeActivation(name: string): void };
	readonly ruleConditionState: Map<string, boolean>;
	readonly syncAggregates: () => void;
	readonly fire: () => FiringResult;
}

function isVirtualClock(c: unknown): c is VirtualClock {
	return typeof (c as VirtualClock).setTime === "function";
}

export function createTick(deps: TemporalSessionDeps): (now?: number) => FiringResult {
	return (now) => {
		deps.assertNotDisposed();
		if (!deps.clock) {
			throw new ArbiterError(
				ArbiterErrorCode.INVALID_CLOCK_OPERATION,
				"Clock not configured. Pass { clock } in session config.",
			);
		}
		if (now !== undefined && isVirtualClock(deps.clock)) {
			deps.clock.setTime(now);
		}
		const suppressedRules = new Map<string, CompiledRule>();
		if (deps.expiryTracker) {
			const expired = deps.expiryTracker.getExpiredRules(deps.clock.now());
			for (const ruleName of expired) {
				deps.scope.revertRule(ruleName);
				deps.scope.clearWriteRecords(ruleName);
				deps.ruleConditionState.delete(ruleName);
				deps.expiryTracker.reset(ruleName);
				const compiled = deps.compiledRules.get(ruleName);
				if (compiled) {
					suppressedRules.set(ruleName, compiled);
					deps.compiledRules.delete(ruleName);
					deps.agenda.removeActivation(ruleName);
				}
			}
		}
		if (deps.accumulateManager) {
			const evicted = deps.accumulateManager.evict(deps.clock.now());
			if (evicted) deps.syncAggregates();
		}
		if (deps.timerQueue) {
			const dueNames = deps.timerQueue.advanceDueTimers(deps.clock.now());
			for (const ruleName of dueNames) {
				const compiled = deps.compiledRules.get(ruleName);
				if (compiled) {
					deps.agenda.addActivation(compiled);
				}
			}
		}
		const tickResult = deps.fire();
		for (const [name, compiled] of suppressedRules) {
			deps.compiledRules.set(name, compiled);
		}
		return tickResult;
	};
}

export function createScheduleRule(deps: TemporalSessionDeps): (ruleName: string, options: ScheduleOptions) => void {
	return (ruleName, options) => {
		deps.assertNotDisposed();
		if (!deps.clock || !deps.timerQueue) {
			throw new ArbiterError(
				ArbiterErrorCode.INVALID_CLOCK_OPERATION,
				"Clock not configured. Pass { clock } in session config.",
			);
		}
		deps.timerQueue.schedule(ruleName, options, deps.clock.now());
	};
}

export function createCancelSchedule(deps: TemporalSessionDeps): (ruleName: string) => void {
	return (ruleName) => {
		deps.assertNotDisposed();
		if (!deps.clock || !deps.timerQueue) {
			throw new ArbiterError(
				ArbiterErrorCode.INVALID_CLOCK_OPERATION,
				"Clock not configured. Pass { clock } in session config.",
			);
		}
		deps.timerQueue.cancel(ruleName);
	};
}
