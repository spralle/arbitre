/** Comparison operators for inequality join constraints */
export interface JoinPredicate {
	readonly $gt?: string;
	readonly $gte?: string;
	readonly $lt?: string;
	readonly $lte?: string;
	readonly $ne?: string;
}

/** A single fact pattern for multi-fact matching in the when clause. */
export interface FactPattern {
	/** The fact type to match against (must be registered in factTypes) */
	readonly $fact: string;
	/** Binding name for this pattern's matched fact (used in then actions and join constraints) */
	readonly $bind: string;
	/** MongoDB-style query to filter facts of this type */
	readonly $where?: Record<string, unknown>;
	/** Cross-pattern join constraints referencing other bindings */
	readonly $join?: Record<string, string | JoinPredicate>;
}

/** Compiled representation of a fact pattern (for beta network use). */
export interface CompiledPattern {
	readonly $fact: string;
	readonly $bind: string;
	readonly $where: Record<string, unknown> | undefined;
	readonly $join: Record<string, string | JoinPredicate> | undefined;
}
