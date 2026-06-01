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

export function createJoinNode(config: JoinNodeConfig): JoinNode {
	const { joinConstraints } = config;
	const leftMemory: Token[] = [];
	const rightMemory: Array<{ bindingName: string; fact: Fact }> = [];
	const outputTokens: Token[] = [];

	const leftActivate = (token: Token): readonly Token[] => {
		leftMemory.push(token);
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
		for (const token of leftMemory) {
			if (constraintsSatisfied(joinConstraints, token.factBindings, bindingName, fact)) {
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
		for (let i = leftMemory.length - 1; i >= 0; i--) {
			if (tokenContainsFact(leftMemory[i], factId)) leftMemory.splice(i, 1);
		}
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
	};

	return { leftActivate, rightActivate, retractFact, getOutputTokens, clear };
}
