import { describe, expect, it } from "vitest";
import { createBetaEvaluator } from "../beta-evaluator.js";
import type { Fact } from "../fact-memory.js";
import type { FactPattern } from "../fact-pattern.js";

function makeFact(id: string, type: string, data: Record<string, unknown>): Fact {
	return { id, type, data };
}

describe("createBetaEvaluator", () => {
	it("activates all patterns of the same $fact type (self-join)", () => {
		const evaluator = createBetaEvaluator();

		// Two patterns both matching "Transaction" fact type (self-join scenario)
		const patterns: FactPattern[] = [
			{ $fact: "Transaction", $bind: "txA" },
			{ $fact: "Transaction", $bind: "txB" },
		];

		evaluator.registerRule("self-join-rule", patterns);

		const tx1 = makeFact("t1", "Transaction", { amount: 100 });
		const tx2 = makeFact("t2", "Transaction", { amount: 200 });

		// Assert first fact — activates both patterns but a single fact cannot
		// self-join (self-exclusion guard prevents fact joining with itself)
		const activations1 = evaluator.onFactAsserted("txA", "Transaction", tx1);
		// No complete tokens yet: one fact cannot pair with itself
		expect(activations1.length).toBe(0);

		// Assert second fact — now joins should produce complete tokens
		const activations2 = evaluator.onFactAsserted("txB", "Transaction", tx2);
		// With two facts and two patterns of same type, we expect activations
		const totalTokens = activations2.reduce((sum, a) => sum + a.tokens.length, 0);
		expect(totalTokens).toBeGreaterThanOrEqual(1);
	});
});
