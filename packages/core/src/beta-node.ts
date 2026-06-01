import type { Fact } from "./fact-memory.js";

/** A token represents a partial or complete match across multiple fact patterns */
export interface Token {
	/** Unique token ID */
	readonly id: string;
	/** Map of binding name → matched fact */
	readonly factBindings: Readonly<Record<string, Fact>>;
}

/** Check if a token contains a fact with the given ID */
export function tokenContainsFact(token: { factBindings: Record<string, { id: string }> }, factId: string): boolean {
	return Object.values(token.factBindings).some((f) => f.id === factId);
}

/** Beta node holds left memory (tokens from upstream) */
export interface BetaNode {
	/** Get all tokens in left memory */
	readonly getTokens: () => readonly Token[];
	/** Add a token to left memory */
	readonly leftActivate: (token: Token) => void;
	/** Remove tokens containing a specific fact */
	readonly removeFactTokens: (factId: string) => readonly Token[];
	/** Clear all tokens */
	readonly clear: () => void;
}

export function createBetaNode(): BetaNode {
	const tokens: Token[] = [];

	const getTokens = (): readonly Token[] => [...tokens];

	const leftActivate = (token: Token): void => {
		tokens.push(token);
	};

	const removeFactTokens = (factId: string): readonly Token[] => {
		const removed: Token[] = [];
		for (let i = tokens.length - 1; i >= 0; i--) {
			const token = tokens[i];
			if (tokenContainsFact(token, factId)) {
				removed.push(token);
				tokens.splice(i, 1);
			}
		}
		return removed;
	};

	const clear = (): void => {
		tokens.length = 0;
	};

	return { getTokens, leftActivate, removeFactTokens, clear };
}
