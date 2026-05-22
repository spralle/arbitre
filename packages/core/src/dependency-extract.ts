import type { CompiledStage } from "./contracts.js";

interface PathNode {
  readonly kind: "path";
  readonly path: string;
}

interface OpNode {
  readonly kind: "op";
  readonly op: string;
  readonly args: readonly unknown[];
}

interface LiteralNode {
  readonly kind: "literal";
  readonly value: unknown;
}

type ExprLike = PathNode | OpNode | LiteralNode;

function isExprLike(node: unknown): node is ExprLike {
  return (
    node !== null &&
    typeof node === "object" &&
    "kind" in (node as Record<string, unknown>) &&
    typeof (node as Record<string, unknown>).kind === "string"
  );
}

/**
 * Recursively walks an ExprNode tree and collects all field path references.
 */
function collectPaths(node: unknown, out: Set<string>): void {
  if (!isExprLike(node)) return;

  if (node.kind === "path") {
    out.add(node.path);
    return;
  }

  if (node.kind === "op") {
    for (const arg of node.args) {
      collectPaths(arg, out);
    }
  }
}

/**
 * Extract all field paths referenced in a compiled condition (ExprNode).
 */
export function extractConditionDeps(condition: unknown): readonly string[] {
  const paths = new Set<string>();
  collectPaths(condition, paths);
  return [...paths];
}

/**
 * Extract all field paths that a rule's stages write to.
 */
export function extractActionDeps(stages: readonly CompiledStage[]): readonly string[] {
  const paths = new Set<string>();
  for (const stage of stages) {
    if (stage.operator === "$focus") continue;
    for (const path of stage.entries.keys()) {
      paths.add(path);
    }
  }
  return [...paths];
}
