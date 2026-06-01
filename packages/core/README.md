# @arbitre/core

Rete-inspired production rule engine for declarative state governance.

## What's New in 0.2.0

- **Beta network / multi-fact joins** — Rules can match across multiple fact types with join constraints
- **Temporal operators** — Time-based conditions (`since`, `within`, `after`) with clock abstraction
- **Clock abstraction** — Real and virtual clocks for deterministic testing
- **Windowed accumulation** — Aggregate facts over sliding time windows
- **Cross-type accumulation** — Accumulate across multiple fact types in a single rule
- **Custom accumulate functions** — Register domain-specific aggregation logic
- **Pattern validation** — Compile-time validation of fact patterns and join constraints

## Overview

`@arbitre/core` implements a forward-chaining production rule engine based on the RETE algorithm. It evaluates rules against a working memory of state and facts, resolving conflicts via salience and activation groups, and applies changes through a pipeline-style action system.

Key features:

- **Match-Resolve-Act cycle** with configurable limits and conflict resolution
- **Alpha network** for fast single-condition filtering
- **Beta network** for multi-fact joins with bind variables
- **Truth Maintenance System (TMS)** for automatic retraction of derived state
- **Namespaced state** with dot-path access
- **Temporal operators** for time-based reasoning
- **Accumulate nodes** for aggregation patterns

## Quick Start

```typescript
import { createSession } from "@arbitre/core";

const session = createSession({
  rules: [
    {
      name: "high-temp-alert",
      when: { $gt: [{ $path: "sensors.temperature" }, 100] },
      then: [{ $set: { "alerts.overheating": true } }],
      salience: 10,
    },
  ],
  initialState: {
    sensors: { temperature: 105 },
    alerts: { overheating: false },
  },
});

const result = session.fire();
// result.rulesFired === 1
// session.getPath("alerts.overheating") === true
```

### Multi-Fact Joins

```typescript
const session = createSession({
  factTypes: [
    { type: "order", fields: { customerId: "string", total: "number" } },
    { type: "customer", fields: { id: "string", tier: "string" } },
  ],
  rules: [
    {
      name: "vip-large-order",
      patterns: [
        { type: "order", bind: "o", constraints: [{ field: "total", op: "gt", value: 1000 }] },
        { type: "customer", bind: "c", constraints: [{ field: "tier", op: "eq", value: "vip" }] },
      ],
      when: { $eq: [{ $path: "o.customerId" }, { $path: "c.id" }] },
      then: [{ $set: { "notifications.vipLargeOrder": true } }],
    },
  ],
});

session.assertFact("customer", { id: "c1", tier: "vip" });
session.assertFact("order", { customerId: "c1", total: 2500 });
session.fire();
```

### Temporal Operators

```typescript
import { createSession, createVirtualClock } from "@arbitre/core";

const clock = createVirtualClock(0);
const session = createSession({
  clock,
  rules: [
    {
      name: "idle-timeout",
      when: { $since: [{ $path: "user.lastActive" }, 30000] },
      then: [{ $set: { "user.status": "idle" } }],
    },
  ],
  initialState: { user: { lastActive: 0, status: "active" } },
});

clock.advance(31000);
session.tick();
// user.status === "idle"
```

## Architecture

### Match-Resolve-Act Cycle

Each call to `session.fire()` runs a forward-chaining loop:

1. **Match** — Evaluate all rule conditions against current state/facts
2. **Resolve** — Collect activated rules into the agenda, order by salience
3. **Act** — Fire the highest-priority rule, apply `then` stages, repeat

The cycle terminates when no rules activate or limits are reached.

### Alpha Network

Single-condition nodes that filter facts by type and field constraints. Each fact assertion propagates through alpha nodes to determine which rules could potentially match.

### Beta Network

Join nodes that combine partial matches from multiple alpha nodes. Beta nodes maintain a token memory of partial matches and produce complete matches when join constraints are satisfied.

### Agenda

Priority queue of activated rule instances. Conflict resolution strategy:

- **Salience** — Higher salience fires first (default: 0)
- **Activation groups** — Only one rule per group fires per cycle
- **Recency** — Among equal-salience rules, most recently activated wins

### Truth Maintenance System (TMS)

Tracks which rules produced which state changes. When a rule's conditions become false, TMS can automatically retract its contributions:

- `autoRetract: "all"` — Retract all derived state when justification is lost
- `autoRetract: "ui-contributions"` — Retract only UI-namespace contributions

### Namespaces

State is organized as a flat dot-path map. Paths like `"sensors.temperature"` and `"alerts.overheating"` provide logical grouping without nested object complexity.

## API Reference

### Exports

```typescript
// Main entry point
import { createSession } from "@arbitre/core";

// Testing utilities
import { createTestSession, fireWith, assertRuleFired, assertRuleNotFired, assertState } from "@arbitre/core/testing";

// Debug utilities
import { explainResult, formatChanges, dumpState } from "@arbitre/core/debug";
```

### `createSession(config: SessionConfig): RuleSession`

Factory function that compiles rules and returns a session instance.

**SessionConfig:**

| Field | Type | Description |
|-------|------|-------------|
| `rules` | `ProductionRule[]` | Rules to compile into the network |
| `initialState` | `Record<string, unknown>` | Starting state |
| `operators` | `OperatorRegistryConfig` | Custom expression operators |
| `limits` | `SessionLimits` | Cycle/firing limits |
| `tms` | `TmsConfig` | Truth maintenance configuration |
| `errorHandling` | `"strict" \| "lenient"` | Error behavior |
| `factTypes` | `FactTypeDefinition[]` | Fact type schemas |
| `accumulates` | `AccumulateConfig[]` | Accumulation definitions |
| `accumulateFunctions` | `Record<string, CustomAccumulateFunction>` | Custom aggregation functions |
| `clock` | `ArbiterClock` | Clock for temporal operators |
| `autoFireOnFactChange` | `boolean` | Auto-fire on fact assert/retract |

### RuleSession

| Method | Description |
|--------|-------------|
| `registerRule(rule)` | Add a rule at runtime |
| `removeRule(name)` | Remove a rule by name |
| `assert(path, value)` | Assert a state value |
| `retract(path)` | Retract a state value |
| `fire()` | Run the match-resolve-act cycle |
| `subscribe(path, cb)` | Watch a path for changes |
| `update(path, value)` | Assert + fire in one call |
| `getState()` | Get full state snapshot |
| `getPath(path)` | Get value at a dot-path |
| `setFocus(group)` | Set the active activation group |
| `dispose()` | Clean up resources |
| `assertFact(type, data)` | Assert a fact, returns fact ID |
| `retractFact(id)` | Retract a fact by ID |
| `getFacts(type)` | Get all facts of a type |
| `tick(now?)` | Advance temporal evaluation |
| `scheduleRule(name, opts)` | Schedule a rule for future firing |
| `cancelSchedule(name)` | Cancel a scheduled rule |

### ProductionRule

```typescript
interface ProductionRule<TState> {
  name: string;
  when: TypedQuery<TState>;          // kuery expression
  then: ThenStage<TState>[];         // pipeline stages
  else?: ThenStage<TState>[];        // stages when condition is false
  salience?: number;                  // priority (default: 0)
  activationGroup?: string;           // mutex group
  onConflict?: "override" | "warn" | "error";
  enabled?: boolean;
  description?: string;
  expires?: number;                   // TTL in ms
  patterns?: FactPattern[];           // multi-fact patterns
  accumulate?: AccumulateConfig[];    // aggregation configs
}
```

### Action Types (ThenStage operators)

| Operator | Description |
|----------|-------------|
| `$set` | Set values at paths |
| `$unset` | Remove values at paths |
| `$inc` | Increment numeric values |
| `$push` | Append to arrays |
| `$pull` | Remove from arrays |
| `$merge` | Shallow merge objects |

### Expression Operators

Conditions use `kuery` expression syntax:

| Operator | Description |
|----------|-------------|
| `$eq` | Equality |
| `$ne` | Not equal |
| `$gt` / `$gte` | Greater than (or equal) |
| `$lt` / `$lte` | Less than (or equal) |
| `$and` / `$or` / `$not` | Logical combinators |
| `$in` / `$nin` | Set membership |
| `$exists` | Path existence check |
| `$path` | Resolve a dot-path value |
| `$regex` | Regular expression match |

### Temporal Operators

| Operator | Description |
|----------|-------------|
| `$since` | True if time elapsed since a timestamp exceeds threshold |
| `$within` | True if event occurred within a time window |
| `$after` | True if current time is after a given timestamp |

### Error Codes

| Code | Description |
|------|-------------|
| `ARBITER_RULE_COMPILATION_FAILED` | Rule could not be compiled |
| `ARBITER_INVALID_PATH` | Invalid dot-path |
| `ARBITER_INVALID_OPERATOR` | Unknown operator in then/when |
| `ARBITER_CYCLE_LIMIT_EXCEEDED` | Max cycles reached |
| `ARBITER_FIRING_LIMIT_EXCEEDED` | Max firings reached |
| `ARBITER_WRITE_CONFLICT` | Multiple rules writing same path |
| `ARBITER_TMS_RETRACT_FAILED` | TMS retraction error |
| `ARBITER_INVALID_NAMESPACE` | Invalid namespace in path |
| `ARBITER_SESSION_DISPOSED` | Operation on disposed session |
| `ARBITER_PROTOTYPE_POLLUTION` | Prototype pollution attempt blocked |
| `ARBITER_EXPRESSION_EVAL_FAILED` | Expression evaluation error |
| `ARBITER_RULE_NOT_FOUND` | Referenced rule does not exist |
| `ARBITER_INVALID_CLOCK_OPERATION` | Invalid clock operation |

## Testing Utilities

Import from `@arbitre/core/testing`:

```typescript
import { createTestSession, fireWith, assertRuleFired, assertRuleNotFired, assertState } from "@arbitre/core/testing";

// Quick session for tests
const session = createTestSession(rules, { counter: 0 });

// Fire rules and get result in one call
const result = fireWith(rules, { temperature: 150 });

// Assertions
assertRuleFired(result, "high-temp-alert");
assertRuleNotFired(result, "low-temp-alert");
assertState(session, "counter", 1);
```

## Debug Utilities

Import from `@arbitre/core/debug`:

```typescript
import { explainResult, formatChanges, dumpState } from "@arbitre/core/debug";

const result = session.fire();

console.log(explainResult(result));
// Fired 2 rules in 1 cycles
// Changes:
//   alerts.overheating: false → true (by high-temp-alert)
// Warnings: none

console.log(formatChanges(result));
console.log(dumpState(session));
```

## Performance

The RETE network provides efficient incremental evaluation:

- **Alpha network** — O(1) per fact type lookup, linear in constraints per node
- **Beta network** — Incremental join; only new tokens propagate
- **State changes** — Only affected rules re-evaluate (no full re-scan)
- **Cycle limits** — Configurable guards prevent runaway inference

Typical performance for rule sets under 100 rules with moderate fact counts:
- Single-fact evaluation: < 1ms
- Multi-fact joins (10 facts × 10 facts): < 5ms
- Full cycle with TMS: < 10ms

## Dependencies

| Dependency | Role |
|------------|------|
| `kuery` | Expression language for rule conditions (`when` clauses) |

## License

MIT
