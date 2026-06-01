import { collectPath } from "kuery";
import type { Token } from "./beta-node.js";
import { tokenContainsFact } from "./beta-node.js";
import type { Fact } from "./fact-memory.js";
import { generateTokenId } from "./token-id.js";

/** A join constraint specifying field equality between two bound facts */
export interface JoinConstraint {
	/** Binding name of the left fact (e.g., "order") */
	readonly leftBinding: string;
	/** Field path on the left fact (e.g., "customerId") */
	readonly leftField: string;
	/** Binding name of the right fact (e.g., "customer") */
	readonly rightBinding: string;
	/** Field path on the right fact (e.g., "id") */
	readonly rightField: string;
}

export interface JoinNode {
	/** Left-activate: new token arrives from upstream beta node */
	readonly leftActivate: (token: Token) => readonly Token[];
	/** Right-activate: new fact arrives from alpha filter */
	readonly rightActivate: (bindingName: string, fact: Fact) => readonly Token[];
	/** Remove tokens containing a specific fact (for retraction) */
	readonly retractFact: (factId: string) => readonly Token[];
	/** Get all output tokens currently produced by this join */
	readonly getOutputTokens: () => readonly Token[];
	/** Clear all memories */
	readonly clear: () => void;
}

export interface JoinNodeConfig {
	readonly joinConstraints: readonly JoinConstraint[];
}

/** Resolve a dot-path field value from a fact's data */
function resolveField(fact: Fact, fieldPath: string): unknown {
	return collectPath(fact.data, fieldPath.split("."));
}

/** Check if all join constraints are satisfied for a token + right fact combination */
function constraintsSatisfied(
	constraints: readonly JoinConstraint[],
	tokenBindings: Readonly<Record<string, Fact>>,
	rightBindingName: string,
	rightFact: Fact,
): boolean {
	for (const c of constraints) {
		const leftFact = c.leftBinding === rightBindingName ? rightFact : tokenBindings[c.leftBinding];
		const rFact = c.rightBinding === rightBindingName ? rightFact : tokenBindings[c.rightBinding];
		if (!leftFact || !rFact) return false; // Missing binding = constraint not satisfied
		const leftVal = resolveField(leftFact, c.leftField);
		const rightVal = resolveField(rFact, c.rightField);
		if (leftVal !== rightVal) return false;
	}
	return true;
}

/**
 * Compute the join key from a left token for a given future rightActivate bindingName.
 * Returns null if the token lacks required bindings.
 */
function computeLeftKey(token: Token, bindingName: string, constraints: readonly JoinConstraint[]): string | null {
	const parts: string[] = [];
	for (const c of constraints) {
		if (c.rightBinding === bindingName) {
			const leftFact = token.factBindings[c.leftBinding];
			if (!leftFact) return null;
			parts.push(String(resolveField(leftFact, c.leftField)));
		} else if (c.leftBinding === bindingName) {
			const rFact = token.factBindings[c.rightBinding];
			if (!rFact) return null;
			parts.push(String(resolveField(rFact, c.rightField)));
		}
	}
	return parts.length > 0 ? parts.join("\x00") : null;
}

/**
 * Compute the join key from a right fact for lookup into the left index.
 */
function computeRightKey(fact: Fact, bindingName: string, constraints: readonly JoinConstraint[]): string | null {
	const parts: string[] = [];
	for (const c of constraints) {
		if (c.rightBinding === bindingName) {
			parts.push(String(resolveField(fact, c.rightField)));
		} else if (c.leftBinding === bindingName) {
			parts.push(String(resolveField(fact, c.leftField)));
		}
	}
	return parts.length > 0 ? parts.join("\x00") : null;
}

/** Get distinct binding names referenced by constraints */
function getIndexedBindingNames(constraints: readonly JoinConstraint[]): readonly string[] {
	const names = new Set<string>();
	for (const c of constraints) {
		names.add(c.leftBinding);
		names.add(c.rightBinding);
	}
	return [...names];
}

export function createJoinNode(config: JoinNodeConfig): JoinNode {
	const { joinConstraints } = config;
	const leftMemory: Token[] = [];
	const rightMemory: Array<{ bindingName: string; fact: Fact }> = [];
	const outputTokens: Token[] = [];

	// Hash index: bindingName → (joinKey → Token[])
	const hasConstraints = joinConstraints.length > 0;
	const indexedBindings = hasConstraints ? getIndexedBindingNames(joinConstraints) : [];
	const leftIndex = new Map<string, Map<string, Token[]>>();

	function addToIndex(token: Token): void {
		for (const bn of indexedBindings) {
			const key = computeLeftKey(token, bn, joinConstraints);
			if (key === null) continue;
			let inner = leftIndex.get(bn);
			if (!inner) {
				inner = new Map();
				leftIndex.set(bn, inner);
			}
			let bucket = inner.get(key);
			if (!bucket) {
				bucket = [];
				inner.set(key, bucket);
			}
			bucket.push(token);
		}
	}

	function rebuildIndex(): void {
		leftIndex.clear();
		for (const token of leftMemory) {
			addToIndex(token);
		}
	}

	const leftActivate = (token: Token): readonly Token[] => {
		leftMemory.push(token);
		if (hasConstraints) addToIndex(token);
		const produced: Token[] = [];
		for (const entry of rightMemory) {
			if (constraintsSatisfied(joinConstraints, token.factBindings, entry.bindingName, entry.fact)) {
				const newToken: Token = {
					id: generateTokenId(),
					factBindings: { ...token.factBindings, [entry.bindingName]: entry.fact },
				};
				outputTokens.push(newToken);
				produced.push(newToken);
			}
		}
		return produced;
	};

	const rightActivate = (bindingName: string, fact: Fact): readonly Token[] => {
		rightMemory.push({ bindingName, fact });
		const produced: Token[] = [];

		if (hasConstraints) {
			// Use hash index for O(1) lookup
			const key = computeRightKey(fact, bindingName, joinConstraints);
			if (key === null) return produced;
			const inner = leftIndex.get(bindingName);
			if (!inner) return produced;
			const candidates = inner.get(key);
			if (!candidates) return produced;
			for (const token of candidates) {
				if (constraintsSatisfied(joinConstraints, token.factBindings, bindingName, fact)) {
					const newToken: Token = {
						id: generateTokenId(),
						factBindings: { ...token.factBindings, [bindingName]: fact },
					};
					outputTokens.push(newToken);
					produced.push(newToken);
				}
			}
		} else {
			// No constraints: cross-product (linear scan)
			for (const token of leftMemory) {
				const newToken: Token = {
					id: generateTokenId(),
					factBindings: { ...token.factBindings, [bindingName]: fact },
				};
				outputTokens.push(newToken);
				produced.push(newToken);
			}
		}
		return produced;
	};

	const retractFact = (factId: string): readonly Token[] => {
		// Remove from right memory
		for (let i = rightMemory.length - 1; i >= 0; i--) {
			if (rightMemory[i].fact.id === factId) {
				rightMemory.splice(i, 1);
			}
		}
		// Remove from left memory
		let leftChanged = false;
		for (let i = leftMemory.length - 1; i >= 0; i--) {
			if (tokenContainsFact(leftMemory[i], factId)) {
				leftMemory.splice(i, 1);
				leftChanged = true;
			}
		}
		// Rebuild index if left memory changed
		if (leftChanged && hasConstraints) rebuildIndex();
		// Remove from output tokens
		const removed: Token[] = [];
		for (let i = outputTokens.length - 1; i >= 0; i--) {
			if (tokenContainsFact(outputTokens[i], factId)) {
				removed.push(outputTokens[i]);
				outputTokens.splice(i, 1);
			}
		}
		return removed;
	};

	const getOutputTokens = (): readonly Token[] => [...outputTokens];

	const clear = (): void => {
		leftMemory.length = 0;
		rightMemory.length = 0;
		outputTokens.length = 0;
		leftIndex.clear();
	};

	return { leftActivate, rightActivate, retractFact, getOutputTokens, clear };
}
