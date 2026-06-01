import type { StateChange } from "./contracts.js";

// ---------------------------------------------------------------------------
// Event types
// ---------------------------------------------------------------------------

export interface RuleActivatedEvent {
	readonly ruleName: string;
	readonly timestamp: number;
}

export interface RuleDeactivatedEvent {
	readonly ruleName: string;
	readonly timestamp: number;
	readonly revertedPaths: readonly string[];
}

export interface RuleFiredEvent {
	readonly ruleName: string;
	readonly timestamp: number;
	readonly changes: readonly StateChange[];
	readonly cycleNumber: number;
}

export interface FactAssertedEvent {
	readonly factId: string;
	readonly factType: string;
	readonly data: Readonly<Record<string, unknown>>;
}

export interface FactRetractedEvent {
	readonly factId: string;
	readonly factType: string;
}

export interface CycleStartEvent {
	readonly cycleNumber: number;
	readonly agendaSize: number;
}

export interface CycleEndEvent {
	readonly cycleNumber: number;
	readonly rulesFired: number;
	readonly changesInCycle: number;
}

// ---------------------------------------------------------------------------
// Hooks interface
// ---------------------------------------------------------------------------

export interface SessionHooks {
	onRuleActivated?: (event: RuleActivatedEvent) => void;
	onRuleDeactivated?: (event: RuleDeactivatedEvent) => void;
	onRuleFired?: (event: RuleFiredEvent) => void;
	onFactAsserted?: (event: FactAssertedEvent) => void;
	onFactRetracted?: (event: FactRetractedEvent) => void;
	onCycleStart?: (event: CycleStartEvent) => void;
	onCycleEnd?: (event: CycleEndEvent) => void;
}

// ---------------------------------------------------------------------------
// Safe emit helper
// ---------------------------------------------------------------------------

export function emitHook<K extends keyof SessionHooks>(
	hooks: SessionHooks | undefined,
	event: K,
	data: Parameters<NonNullable<SessionHooks[K]>>[0],
): void {
	const handler = hooks?.[event];
	if (handler) {
		try {
			(handler as (data: unknown) => void)(data);
		} catch {
			// Hooks must never crash the engine
		}
	}
}
