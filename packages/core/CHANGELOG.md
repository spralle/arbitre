# @arbitre/core

## 0.2.0

### Minor Changes

- Add checkpoint/rollback API for speculative state evaluation

## 0.1.0

### Minor Changes

- 2377a93: Initial release of @arbitre/core — Rete-inspired production rule engine.

  Features:

  - RETE alpha + beta network with multi-fact join matching
  - Match-resolve-act fire cycle with propagation
  - MongoDB-style conditions (via kuery) and pipeline-style actions
  - Salience-based agenda with activation groups and focus stack
  - Truth Maintenance System with fact-level provenance tracking
  - Namespaced state management ($ui, $state, $meta, $contributions)
  - MongoDB update operators ($set, $unset, $inc, $push, $pull, $merge)
  - Expression operators ($sum, $multiply, $cond, $coalesce, etc.)
  - Temporal operators ($elapsed, $within, $after, $before) with clock abstraction
  - Timer queue for scheduled rule activation/deactivation
  - Rule expiry with auto-deactivation
  - Accumulate nodes (sum, count, min, max, avg, collect)
  - Windowed accumulation (time-based sliding window)
  - Cross-type accumulation (join-scoped aggregation)
  - Custom accumulate functions (user-defined aggregation)
  - Fact type registration and working memory CRUD
  - Pattern validation with compile-time error messages
  - Security: prototype pollution prevention, recursion limits
  - Testing utilities (createTestSession, fireWith, assertRuleFired)
  - Debug utilities (explainResult, formatChanges, dumpState)
