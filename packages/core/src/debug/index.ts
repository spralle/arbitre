import type { FiringResult, RuleSession } from "../contracts.js";

/** Human-readable summary of a firing result. */
export function explainResult(result: FiringResult): string {
  const lines: string[] = [];
  lines.push(`Fired ${result.rulesFired} rules in ${result.cycles} cycles`);
  lines.push("Changes:");
  if (result.changes.length === 0) {
    lines.push("  (none)");
  } else {
    for (const c of result.changes) {
      lines.push(`  ${c.path}: ${fmt(c.previousValue)} → ${fmt(c.newValue)} (by ${c.ruleName})`);
    }
  }
  const warnCount = result.warnings.length;
  lines.push(`Warnings: ${warnCount === 0 ? "none" : String(warnCount)}`);
  if (warnCount > 0) {
    for (const w of result.warnings) {
      lines.push(`  [${w.code}] ${w.message}`);
    }
  }
  return lines.join("\n");
}

/** Format all changes from a firing result. */
export function formatChanges(result: FiringResult): string {
  if (result.changes.length === 0) return "(no changes)";
  return result.changes
    .map((c) => `${c.path}: ${fmt(c.previousValue)} → ${fmt(c.newValue)} (by ${c.ruleName})`)
    .join("\n");
}

/** Dump the current session state as formatted JSON. */
export function dumpState(session: RuleSession): string {
  return JSON.stringify(session.getState(), null, 2);
}

function fmt(value: unknown): string {
  return value === undefined ? "undefined" : JSON.stringify(value);
}
