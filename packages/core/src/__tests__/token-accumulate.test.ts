import { describe, expect, it } from "vitest";
import { createSession } from "../session.js";

function makeSessionConfig() {
	return {
		factTypes: [{ name: "entry", fields: { stackKey: "string", tier: "number", weight: "number" } }] as const,
		rules: [
			{
				name: "weight-inversion",
				patterns: [
					{ $fact: "entry", $bind: "top" },
					{
						$fact: "entry",
						$bind: "bottom",
						$join: { stackKey: "$top.stackKey", tier: { $gt: "$top.tier" } },
					},
				],
				when: { $always: true },
				then: [{ $set: { _noop: true } }],
			},
		],
		accumulates: [
			{
				factType: "entry",
				field: "",
				fn: "$sum",
				alias: "totalInversionPenalty",
				rule: "weight-inversion",
				expr: { $subtract: ["$bottom.weight", "$top.weight"] },
			},
		],
		autoFireOnFactChange: false,
	};
}

describe("Token-driven Accumulate", () => {
	it("computes basic token-driven sum from expression", () => {
		const session = createSession(makeSessionConfig());

		// Stack s1: tier 1 weight 10, tier 2 weight 5
		// Inversion: bottom(tier2, w5) - top(tier1, w10) = -5
		session.assertFact("entry", { stackKey: "s1", tier: 1, weight: 10 });
		session.assertFact("entry", { stackKey: "s1", tier: 2, weight: 5 });

		const agg = session.getPath("$aggregates.totalInversionPenalty");
		expect(agg).toBe(-5);
	});

	it("computes token-driven count", () => {
		const session = createSession({
			...makeSessionConfig(),
			accumulates: [
				{
					factType: "entry",
					field: "",
					fn: "$count",
					alias: "inversionCount",
					rule: "weight-inversion",
					expr: { $subtract: ["$bottom.weight", "$top.weight"] },
				},
			],
		});

		session.assertFact("entry", { stackKey: "s1", tier: 1, weight: 10 });
		session.assertFact("entry", { stackKey: "s1", tier: 2, weight: 5 });
		session.assertFact("entry", { stackKey: "s1", tier: 3, weight: 3 });

		// Inversions: (1,2), (1,3), (2,3) = 3 tokens
		const agg = session.getPath("$aggregates.inversionCount");
		expect(agg).toBe(3);
	});

	it("retraction updates accumulate correctly", () => {
		const session = createSession(makeSessionConfig());

		session.assertFact("entry", { stackKey: "s1", tier: 1, weight: 10 });
		const id2 = session.assertFact("entry", { stackKey: "s1", tier: 2, weight: 5 });
		session.assertFact("entry", { stackKey: "s1", tier: 3, weight: 3 });

		// Before retraction: inversions (1,2), (1,3), (2,3)
		// Penalties: 5-10=-5, 3-10=-7, 3-5=-2 => sum=-14
		expect(session.getPath("$aggregates.totalInversionPenalty")).toBe(-14);

		// Retract tier 2 entry — removes tokens (1,2) and (2,3)
		session.retractFact(id2);

		// Remaining: only (1,3), penalty = 3-10 = -7
		expect(session.getPath("$aggregates.totalInversionPenalty")).toBe(-7);
	});

	it("assert new fact updates accumulate", () => {
		const session = createSession(makeSessionConfig());

		session.assertFact("entry", { stackKey: "s1", tier: 1, weight: 10 });
		session.assertFact("entry", { stackKey: "s1", tier: 2, weight: 5 });

		expect(session.getPath("$aggregates.totalInversionPenalty")).toBe(-5);

		// Add tier 3 — creates new tokens (1,3) and (2,3)
		session.assertFact("entry", { stackKey: "s1", tier: 3, weight: 1 });

		// Penalties: (1,2)=-5, (1,3)=-9, (2,3)=-4 => sum=-18
		expect(session.getPath("$aggregates.totalInversionPenalty")).toBe(-18);
	});

	it("checkpoint and rollback restores accumulate state", () => {
		const session = createSession(makeSessionConfig());

		session.assertFact("entry", { stackKey: "s1", tier: 1, weight: 10 });
		session.assertFact("entry", { stackKey: "s1", tier: 2, weight: 5 });

		expect(session.getPath("$aggregates.totalInversionPenalty")).toBe(-5);

		const cp = session.checkpoint();

		session.assertFact("entry", { stackKey: "s1", tier: 3, weight: 1 });
		expect(session.getPath("$aggregates.totalInversionPenalty")).toBe(-18);

		session.rollback(cp);

		// After rollback, scope is restored to -5
		expect(session.getPath("$aggregates.totalInversionPenalty")).toBe(-5);
	});

	it("works with combined inequality + self-exclusion + token accumulate", () => {
		const session = createSession({
			factTypes: [{ name: "entry", fields: { stackKey: "string", tier: "number", weight: "number" } }],
			rules: [
				{
					name: "weight-inversion",
					patterns: [
						{ $fact: "entry", $bind: "top" },
						{
							$fact: "entry",
							$bind: "bottom",
							$join: { stackKey: "$top.stackKey", tier: { $gt: "$top.tier" } },
						},
					],
					when: { $always: true },
					then: [{ $set: { _noop: true } }],
				},
			],
			accumulates: [
				{
					factType: "entry",
					field: "",
					fn: "$sum",
					alias: "totalInversionPenalty",
					rule: "weight-inversion",
					expr: { $subtract: ["$bottom.weight", "$top.weight"] },
				},
			],
			autoFireOnFactChange: false,
		});

		// Two stacks — only same-stack pairs should form tokens
		session.assertFact("entry", { stackKey: "s1", tier: 1, weight: 10 });
		session.assertFact("entry", { stackKey: "s1", tier: 2, weight: 3 });
		session.assertFact("entry", { stackKey: "s2", tier: 1, weight: 20 });
		session.assertFact("entry", { stackKey: "s2", tier: 2, weight: 15 });

		// s1 inversion: 3-10 = -7
		// s2 inversion: 15-20 = -5
		// Total: -12
		expect(session.getPath("$aggregates.totalInversionPenalty")).toBe(-12);
	});

	it("multiple accumulators on same rule with different expressions", () => {
		const session = createSession({
			...makeSessionConfig(),
			accumulates: [
				{
					factType: "entry",
					field: "",
					fn: "$sum",
					alias: "totalInversionPenalty",
					rule: "weight-inversion",
					expr: { $subtract: ["$bottom.weight", "$top.weight"] },
				},
				{
					factType: "entry",
					field: "",
					fn: "$count",
					alias: "inversionCount",
					rule: "weight-inversion",
					expr: 1,
				},
			],
		});

		session.assertFact("entry", { stackKey: "s1", tier: 1, weight: 10 });
		session.assertFact("entry", { stackKey: "s1", tier: 2, weight: 5 });
		session.assertFact("entry", { stackKey: "s1", tier: 3, weight: 3 });

		expect(session.getPath("$aggregates.totalInversionPenalty")).toBe(-14);
		expect(session.getPath("$aggregates.inversionCount")).toBe(3);
	});
});
