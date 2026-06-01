import type { Token } from "./beta-node.js";
import { tokenContainsFact } from "./beta-node.js";
import type { Fact } from "./fact-memory.js";
import type { FactPattern } from "./fact-pattern.js";
import type { JoinConstraint, JoinNode } from "./join-node.js";
import { createJoinNode } from "./join-node.js";
import { generateTokenId } from "./token-id.js";

/** An alpha filter node that matches facts of a specific type */
export interface AlphaFilterNode {
	readonly factType: string;
	readonly bindingName: string;
	readonly whereClause?: Record<string, unknown> | undefined;
}

/** A compiled beta network for a single rule's patterns */
export interface BetaNetwork {
	readonly alphaFilters: readonly AlphaFilterNode[];
	readonly joinNodes: readonly JoinNode[];
	readonly isDegenerate: boolean;
	readonly activate: (bindingName: string, fact: Fact) => readonly Token[];
	readonly retract: (factId: string) => readonly Token[];
	readonly getCompleteTokens: () => readonly Token[];
}

/** Extract join constraints from a pattern's $join field */
function extractJoinConstraints(pattern: FactPattern): readonly JoinConstraint[] {
	if (!pattern.$join) return [];
	const constraints: JoinConstraint[] = [];
	for (const [rightField, ref] of Object.entries(pattern.$join)) {
		// ref format: "$bindingName.fieldPath"
		const match = ref.match(/^\$(\w+)\.(.+)$/);
		if (!match) continue;
		const [, leftBinding, leftField] = match;
		constraints.push({
			leftBinding,
			leftField,
			rightBinding: pattern.$bind,
			rightField,
		});
	}
	return constraints;
}

/** Build a degenerate beta network for a single-pattern rule */
function buildDegenerateNetwork(pattern: FactPattern): BetaNetwork {
	const alphaFilter: AlphaFilterNode = {
		factType: pattern.$fact,
		bindingName: pattern.$bind,
		whereClause: pattern.$where,
	};
	const tokens: Token[] = [];

	const activate = (bindingName: string, fact: Fact): readonly Token[] => {
		if (bindingName !== pattern.$bind) return [];
		const token: Token = {
			id: generateTokenId("beta-token"),
			factBindings: { [bindingName]: fact },
		};
		tokens.push(token);
		return [token];
	};

	const retract = (factId: string): readonly Token[] => {
		const removed: Token[] = [];
		for (let i = tokens.length - 1; i >= 0; i--) {
			if (tokenContainsFact(tokens[i], factId)) {
				removed.push(tokens[i]);
				tokens.splice(i, 1);
			}
		}
		return removed;
	};

	const getCompleteTokens = (): readonly Token[] => [...tokens];

	return {
		alphaFilters: [alphaFilter],
		joinNodes: [],
		isDegenerate: true,
		activate,
		retract,
		getCompleteTokens,
	};
}

/** Build a multi-pattern beta network with join nodes chained left-to-right */
function buildMultiPatternNetwork(patterns: readonly FactPattern[]): BetaNetwork {
	const alphaFilters: AlphaFilterNode[] = patterns.map((p) => ({
		factType: p.$fact,
		bindingName: p.$bind,
		whereClause: p.$where,
	}));

	// Build join nodes: one per pattern after the first
	const joinNodes: JoinNode[] = [];
	for (let i = 1; i < patterns.length; i++) {
		const constraints = extractJoinConstraints(patterns[i]);
		joinNodes.push(createJoinNode({ joinConstraints: constraints }));
	}

	// Map binding names to pattern positions
	const bindingIndex = new Map<string, number>();
	for (let i = 0; i < patterns.length; i++) {
		bindingIndex.set(patterns[i].$bind, i);
	}

	const activate = (bindingName: string, fact: Fact): readonly Token[] => {
		const pos = bindingIndex.get(bindingName);
		if (pos === undefined) return [];

		if (pos === 0) {
			// Left-activate the first join node with a single-fact token
			const token: Token = { id: generateTokenId("beta-token"), factBindings: { [bindingName]: fact } };
			let produced = joinNodes[0].leftActivate(token);
			// Propagate through downstream join nodes
			for (let i = 1; i < joinNodes.length; i++) {
				const next: Token[] = [];
				for (const t of produced) {
					next.push(...joinNodes[i].leftActivate(t));
				}
				produced = next;
			}
			return produced;
		}

		// Right-activate the join node at position pos-1
		let produced = joinNodes[pos - 1].rightActivate(bindingName, fact);
		// Propagate through downstream join nodes
		for (let i = pos; i < joinNodes.length; i++) {
			const next: Token[] = [];
			for (const t of produced) {
				next.push(...joinNodes[i].leftActivate(t));
			}
			produced = next;
		}
		return produced;
	};

	const retract = (factId: string): readonly Token[] => {
		const allRemoved: Token[] = [];
		for (const node of joinNodes) {
			allRemoved.push(...node.retractFact(factId));
		}
		return allRemoved;
	};

	const getCompleteTokens = (): readonly Token[] => {
		// Complete tokens are in the last join node's output
		return joinNodes[joinNodes.length - 1].getOutputTokens();
	};

	return {
		alphaFilters,
		joinNodes,
		isDegenerate: false,
		activate,
		retract,
		getCompleteTokens,
	};
}

/** Compile a beta network from a rule's patterns */
export function compileBetaNetwork(patterns: readonly FactPattern[]): BetaNetwork {
	if (patterns.length === 0) {
		throw new Error("Cannot compile beta network with zero patterns");
	}
	if (patterns.length === 1) {
		return buildDegenerateNetwork(patterns[0]);
	}
	return buildMultiPatternNetwork(patterns);
}
