---
"@arbitre/core": minor
---

Initial 0.1.0 release of @arbitre/core — Rete-inspired production rule engine.

Features:
- Production rule compilation with MongoDB-style conditions (via kuery)
- Match-resolve-act fire cycle with propagation
- Alpha network for efficient change routing
- Salience-based agenda with focus groups
- Truth Maintenance System (auto-retract on condition flip)
- Namespaced state management ($ui, $state, $meta, $contributions)
- MongoDB update pipeline actions ($set, $unset, $inc, $push, $pull, $merge)
- Expression operators ($sum, $multiply, $cond, $coalesce, etc.)
- Rule validation with security checks (prototype pollution protection)
- L2 multi-fact support with accumulate nodes
- Testing utilities (createTestSession, fireWith, assertRuleFired)
- Debug utilities (explainResult, formatChanges, dumpState)
