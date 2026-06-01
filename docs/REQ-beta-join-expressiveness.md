# @arbitre/core Enhancement Requirements: Beta Network Join Expressiveness

> Status: **Ready for implementation**
> Priority order: REQ-1 → REQ-3 → REQ-2 → REQ-4
> Consumer: `lx-react-client-playground` yard optimizer (ArbiterScoreDirector)

## Context

@arbitre/core@0.2.0 has a working Rete engine with alpha network, beta network (equality joins),
accumulate nodes, TMS, and checkpoint/rollback. A downstream consumer (constraint optimization solver)
needs to express pairwise comparison constraints across facts. Currently blocked by three gaps in join
expressiveness.

## Measured Performance Baseline (v0.2.0)

| Scenario | Result |
|----------|--------|
| Raw retract+assert+fire (no rules) | 660,000 ops/sec |
| 500 facts, 1 rule (3-way equality join) | 17,400 evals/sec |
| 500 facts, 3 rules | 5,900 evals/sec |
| 500 facts, 11 rules | 2,800 evals/sec |
| 2000 facts, 2 rules | 3,300 evals/sec |

Methodology: Each "eval" = retract one assignment fact + assert replacement + fire + retract + restore + fire (simulates solver move evaluation with undo).

---

## REQ-1: Self-Exclusion in Self-Joins (Correctness Fix)

**Priority:** P0 — correctness bug

**Problem:** When two patterns in a rule match the same fact type, a fact can join with ITSELF,
producing spurious tokens. This produces incorrect counts in accumulate nodes.

**Example:**
```typescript
patterns: [
  { $fact: 'entry', $bind: 'a' },
  { $fact: 'entry', $bind: 'b', $join: { stackKey: '$a.stackKey' } },
]
// 3 entries in same stack → produces 9 tokens (including a=b self-matches)
// Should produce 6 tokens (excluding identity matches)
```

**Requirement:** When multiple patterns in a rule bind the same fact type, the beta network MUST NOT
produce tokens where the same fact instance appears in multiple bindings. A token `{a: fact1, b: fact1}`
is invalid and must be excluded.

**Implementation guidance:**

In `JoinNode` (or equivalent beta node) during token construction, check that no fact ID appears
in more than one binding slot of the produced token. For a 2-pattern self-join this is:
```
token.factBindings[bindA].id !== incomingFact.id
```

For N-pattern rules, check all existing bindings against the incoming fact.

**Acceptance criteria:**
- 3 facts of same type in self-join → 6 tokens (not 9)
- 100 facts in self-join → 9,900 tokens (not 10,000)
- No performance regression on non-self-join scenarios (different fact types never trigger the check)
- Existing tests continue passing

---

## REQ-2: Token-Binding Access in Rule Actions

**Priority:** P1 — enables computed scoring

**Problem:** The `then` clause's `$set`/`$inc` operators can reference scope state paths via `$path`,
but CANNOT reference field values from the matched fact bindings in the current token. Rules can
detect that a match EXISTS but cannot compute values FROM the matched facts.

**Current state in code:**
- `FactPattern.$bind` names the binding (`contracts.ts:6`)
- `ThenStage` operators resolve values via scope (`contracts.ts:40-42`)
- No mechanism exists to inject token fact data into expression resolution

**Example (currently impossible):**
```typescript
{
  name: 'weight-penalty',
  patterns: [
    { $fact: 'entry', $bind: 'top' },
    { $fact: 'entry', $bind: 'bottom', $join: { stackKey: '$top.stackKey' } },
  ],
  when: {},
  then: [{ $inc: { 'score.penalty': { $subtract: ['$top.weight', '$bottom.weight'] } } }],
}
```

**Requirement:** When a rule fires due to pattern matching, the token's fact bindings MUST be available
in the expression evaluation scope during `then` execution. Binding references use the pattern's `$bind`
name as a namespace prefix: `$bindingName.fieldName`.

**Resolution rules:**
1. `$bindingName.fieldName` → look up binding in current token → access `fact.data[fieldName]`
2. If no token context exists (scope-only rule), `$bindingName.x` falls through to scope resolution
3. Nested paths: `$binding.nested.field` → `fact.data.nested.field`

**Acceptance criteria:**
- `$set: { result: '$binding.field' }` resolves to the matched fact's field value
- Expression operators: `{ $subtract: ['$a.weight', '$b.weight'] }` computes correctly
- Non-pattern rules (scope-only) are unaffected
- Token binding takes precedence over scope paths with same prefix

---

## REQ-3: Inequality Join Predicates

**Priority:** P0 — highest functional impact

**Problem:** `$join` is typed as `Record<string, string>` (see `fact-pattern.ts:10`), supporting only
equality constraints like `{ field: '$other.field' }`. Many constraint rules need inequality
relationships: "item A is above item B" (tier comparison), "departure A is before departure B".

**Example (currently impossible):**
```typescript
{
  name: 'weight-inversion',
  patterns: [
    { $fact: 'entry', $bind: 'top' },
    { $fact: 'entry', $bind: 'bottom', $join: {
      stackKey: '$top.stackKey',           // equality (existing)
      tier: { $gt: '$top.tier' },          // inequality (NEW)
    }},
  ],
}
```

**Requirement:** Extend `$join` value type to support comparison operator objects:

```typescript
// Updated type (fact-pattern.ts)
readonly $join?: Record<string, string | JoinPredicate>;

interface JoinPredicate {
  $gt?: string;   // greater than binding reference
  $gte?: string;  // greater than or equal
  $lt?: string;   // less than
  $lte?: string;  // less than or equal
  $ne?: string;   // not equal
}
```

**Semantics:**
- `{ field: '$a.otherField' }` — existing equality (unchanged)
- `{ field: { $gt: '$a.otherField' } }` — `currentFact.data[field] > referencedFact.data[otherField]`
- Multiple operators on same field: all must be satisfied (AND)

**Performance constraint:** Inequality joins cannot use hash indexes. Implementation MUST:
1. Evaluate equality join conditions FIRST (via existing hash index)
2. Apply inequality predicates as a post-filter on candidates

For the common pattern (equality + inequality on same join), this means:
```
candidates = hashIndex.lookup(equalityKey)  // O(1)
results = candidates.filter(inequalityPredicate)  // O(candidates)
```

NOT:
```
results = allFacts.filter(equality && inequality)  // O(N) — unacceptable
```

**Acceptance criteria:**
- `$join: { stackKey: '$a.stackKey', tier: { $gt: '$a.tier' } }` matches only facts where
  `fact.tier > a.tier` AND `fact.stackKey === a.stackKey`
- Combined with REQ-1: 5-entry stack → exactly 10 ordered pairs (C(5,2) × 2 directions, filtered
  by tier ordering = 10 "above/below" pairs)
- Performance: equality-first optimization verified (add benchmark test)
- Existing equality-only joins unaffected (string value still works as before)
- `CompiledPattern.$join` type updated accordingly

---

## REQ-4: Multi-Token Accumulate with Computed Values

**Priority:** P2 — scoring model completion

**Problem:** Current `AccumulateConfig` operates on single facts (one factType, one field). It cannot
compute values that span multiple facts in a token (e.g., "sum of weight differences between all
matched pairs"). The `fn` field references built-in functions (`$count`, `$sum`, `$min`, `$max`,
`$avg`) that each operate on a single field of a single fact type.

**Current state:**
- `AccumulateConfig.binding` and `.rule` exist (`accumulate-node.ts:17-19`) suggesting
  cross-type/cross-rule accumulate was anticipated
- `CustomAccumulateFunction` exists as an extension point
- But the `addFact`/`removeFact` interface receives single `Fact` objects, not token tuples

**Requirement:** Support accumulate functions that receive token data (multiple bound facts):

```typescript
// Option A: Extend AccumulateConfig with expression-based value extraction
interface AccumulateConfig {
  // ... existing fields ...
  /** Expression to compute the value to accumulate (instead of simple field extraction) */
  readonly expr?: ExprNode | undefined;
  /** Rule whose beta network tokens drive this accumulate */
  readonly rule?: string | undefined;
}

// Example usage:
{
  fn: '$sum',
  alias: 'weightInversionPenalty',
  rule: 'weight-inversion',  // tokens come from this rule's beta network
  expr: { $subtract: ['$bottom.weight', '$top.weight'] },  // computed per token
}
```

**Alternative (Option B):** Custom accumulate function receives full token:
```typescript
type TokenAccumulateFunction = (
  tokens: ReadonlyArray<Record<string, Fact>>,  // binding name → fact
) => number | null;
```

**Acceptance criteria:**
- Accumulate driven by multi-pattern rule tokens (not single facts)
- Computed expression evaluated per token, aggregated by fn ($sum, $count, etc.)
- Retraction: when a fact is retracted, affected tokens are removed, accumulate recomputes
- Custom function option available for complex cases
- Checkpoint/rollback correctly snapshots/restores token-based accumulate state

---

## Performance Targets After Implementation

| Scenario | Current (v0.2.0) | Target (with REQ-1–4) |
|----------|------------------|-----------------------|
| 500 units, 11 constraint rules | 2,800 evals/sec | 3,500–5,000 evals/sec |
| 500 units, 7 constraints (no self-join) | 3,800 evals/sec | 4,000–5,500 evals/sec |
| 2000 units, 11 constraint rules | ~800 evals/sec | 1,200–2,000 evals/sec |

Improvement sources:
- REQ-1: Self-exclusion reduces token count (N² → N(N-1)), fewer propagations through accumulate
- REQ-3: Inequality joins filter early in beta network, fewer tokens reaching downstream nodes
- REQ-2/4: Eliminate post-hoc imperative validation of Rete results in consumer code

---

## Non-Goals

- No changes to state-based rule evaluation (non-pattern rules, `when` clause on scope)
- No changes to TMS, temporal operators, or clock subsystem
- No changes to checkpoint/rollback API (only internal snapshot contents may grow)
- The `when` clause semantics for scope-based evaluation remain unchanged
- Backward compatibility: all existing 522+ tests must continue passing

## Verification

```bash
bun run test          # all existing tests pass
bun run typecheck     # no type errors
bun run lint          # no lint violations
```

Plus new tests per requirement (acceptance criteria above).

## File Map (likely touched)

| File | Change |
|------|--------|
| `packages/core/src/fact-pattern.ts` | Update `$join` type to support predicates |
| `packages/core/src/beta-evaluator.ts` | Self-exclusion check, inequality filter |
| `packages/core/src/stage-executor.ts` | Token-binding resolution in `$set`/`$inc` |
| `packages/core/src/accumulate-node.ts` | Token-based accumulate, expression eval |
| `packages/core/src/accumulate-functions.ts` | Custom token-aware functions |
| `packages/core/src/contracts.ts` | Type updates for JoinPredicate, extended AccumulateConfig |
| `packages/core/src/session.ts` | Pass token context to firing pipeline |
