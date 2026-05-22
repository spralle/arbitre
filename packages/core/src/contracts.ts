import type { DotPaths, PathValue, TypedQuery } from "kuery";

// ---------------------------------------------------------------------------
// ThenStage — MongoDB pipeline-style update operations (ADR §2.2)
// Each stage is a single-key object with a $-prefixed operator.
// Array ordering determines execution sequence.
// ---------------------------------------------------------------------------

/** Operator handler: receives field entries and scope, applies mutations. */
export type ThenOperatorHandler = (
  entries: ReadonlyMap<string, unknown>,
  scope: Readonly<Record<string, unknown>>,
  write: (path: string, value: unknown) => void,
) => void;

/** Registry for pluggable then operators. */
export interface ThenOperatorRegistry {
  readonly register: (name: string, handler: ThenOperatorHandler) => void;
  readonly get: (name: string) => ThenOperatorHandler | undefined;
  readonly has: (name: string) => boolean;
}

/** A single pipeline stage — one $-prefixed operator key. */
export type ThenStage<TState = Record<string, unknown>> = Readonly<Record<string, unknown>> & {
  /** Type-safe $set: paths are constrained to DotPaths<TState>. */
  readonly $set?: { readonly [P in DotPaths<TState>]?: PathValue<TState, P> };
};

/** Expression or literal value — validated at compile time, not type level. */
export type ThenValue = unknown;

// ---------------------------------------------------------------------------
// ProductionRule (ADR §2.1)
// ---------------------------------------------------------------------------

export interface ProductionRule<TState = Record<string, unknown>> {
  readonly name: string;
  readonly when: TypedQuery<TState>;
  readonly then: readonly ThenStage<TState>[];
  readonly else?: readonly ThenStage<TState>[] | undefined;
  readonly salience?: number | undefined;
  readonly activationGroup?: string | undefined;
  readonly onConflict?: "override" | "warn" | "error" | undefined;
  readonly enabled?: boolean | undefined;
  readonly description?: string | undefined;
}

// ---------------------------------------------------------------------------
// Session configuration (ADR §3)
// ---------------------------------------------------------------------------

export type OperatorFunction = (args: readonly unknown[], scope: Readonly<Record<string, unknown>>) => unknown;

export interface OperatorRegistryConfig {
  readonly custom?: Readonly<Record<string, OperatorFunction>> | undefined;
}

export interface SessionLimits {
  readonly maxCycles?: number | undefined;
  readonly maxRuleFirings?: number | undefined;
  readonly warnAtCycles?: number | undefined;
  readonly warnAtFirings?: number | undefined;
}

export interface TmsConfig {
  readonly autoRetract?: "ui-contributions" | "all" | undefined;
}

export interface SessionConfig<TState = Record<string, unknown>> {
  readonly rules?: readonly ProductionRule<TState>[] | undefined;
  readonly initialState?: Readonly<Record<string, unknown>> | undefined;
  readonly operators?: OperatorRegistryConfig | undefined;
  readonly limits?: SessionLimits | undefined;
  readonly tms?: TmsConfig | undefined;
  readonly validation?: "strict" | "syntax" | "none" | undefined;
  readonly errorHandling?: "strict" | "lenient" | undefined;
  readonly thenOperators?: ThenOperatorRegistry | undefined;
}

// ---------------------------------------------------------------------------
// Firing result & diagnostics (ADR §3)
// ---------------------------------------------------------------------------

import type { ArbiterErrorCode } from "./errors.js";

export interface StateChange {
  readonly path: string;
  readonly previousValue: unknown;
  readonly newValue: unknown;
  readonly ruleName: string;
}

export interface ArbiterWarning {
  readonly code: ArbiterErrorCode;
  readonly message: string;
  readonly ruleName?: string | undefined;
}

export interface FiringResult {
  readonly rulesFired: number;
  readonly cycles: number;
  readonly changes: readonly StateChange[];
  readonly warnings: readonly ArbiterWarning[];
}

// ---------------------------------------------------------------------------
// RuleSession — main API surface (ADR §3)
// ---------------------------------------------------------------------------

export type SubscriptionCallback = (value: unknown, previousValue: unknown) => void;
export type Unsubscribe = () => void;

export interface RuleSession<TState = Record<string, unknown>> {
  readonly registerRule: (rule: ProductionRule<TState>) => void;
  readonly removeRule: (name: string) => void;
  readonly assert: (path: string, value: unknown) => void;
  readonly retract: (path: string) => void;
  readonly fire: () => FiringResult;

  readonly subscribe: (path: string, callback: SubscriptionCallback) => Unsubscribe;
  readonly update: (path: string, value: unknown) => FiringResult;

  readonly getState: () => Readonly<Record<string, unknown>>;
  readonly getPath: (path: string) => unknown;

  readonly setFocus: (group: string) => void;

  readonly dispose: () => void;
}

// ---------------------------------------------------------------------------
// WriteRecord — TMS provenance tracking
// ---------------------------------------------------------------------------

export interface WriteRecord {
  readonly path: string;
  readonly value: unknown;
  readonly snapshotValue: unknown;
  readonly ruleName: string;
}

// ---------------------------------------------------------------------------
// Compiled internal types (not exported from main barrel)
// ---------------------------------------------------------------------------

export interface CompiledRule {
  readonly name: string;
  readonly condition: unknown;
  readonly actions: readonly CompiledStage[];
  readonly elseActions?: readonly CompiledStage[] | undefined;
  readonly salience: number;
  readonly activationGroup?: string | undefined;
  readonly onConflict: "override" | "warn" | "error";
  readonly enabled: boolean;
  readonly hasTms: boolean;
  readonly source: ProductionRule<unknown>;
}

export interface CompiledStage {
  readonly operator: string;
  readonly entries: ReadonlyMap<string, unknown>;
}
