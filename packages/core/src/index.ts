// Public types — rule definitions
// Public types — session configuration
// Public types — session API
// Public types — results & diagnostics
export type {
  ArbiterWarning,
  FiringResult,
  OperatorFunction,
  OperatorRegistryConfig,
  ProductionRule,
  RuleSession,
  SessionConfig,
  SessionLimits,
  StateChange,
  SubscriptionCallback,
  ThenOperatorHandler,
  ThenOperatorRegistry,
  ThenStage,
  ThenValue,
  TmsConfig,
  Unsubscribe,
  WriteRecord,
} from "./contracts.js";

// Error types
export { ArbiterError, ArbiterErrorCode } from "./errors.js";

// Session factory
export { createSession } from "./session.js";
