---
'@arbitre/core': minor
---

Add beta join expressiveness enhancements:

- **Self-exclusion in self-joins** (REQ-1): When multiple patterns match the same fact type, tokens no longer include duplicate fact instances across bindings. Fixes spurious token counts in accumulate nodes downstream of self-joins.
- **Inequality join predicates** (REQ-3): `$join` now supports comparison operators (`$gt`, `$gte`, `$lt`, `$lte`, `$ne`) in addition to equality. Equality constraints are evaluated first via hash index, with inequality applied as post-filter.
- **Token-binding access in rule actions** (REQ-2): `$binding.field` references in `then` stage expressions now resolve to matched fact data from the current token.
- **Multi-token accumulate** (REQ-4): Accumulate nodes can now be driven by a rule's beta network tokens with per-token expression evaluation, enabling cross-fact aggregate computations.
