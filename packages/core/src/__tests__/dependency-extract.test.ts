import { describe, expect, test } from "vitest";
import type { CompiledStage } from "../contracts.js";
import { extractActionDeps, extractConditionDeps } from "../dependency-extract.js";

describe("extractConditionDeps", () => {
  test("extracts field path from simple path node", () => {
    const condition = { kind: "path", path: "user.name" };
    expect(extractConditionDeps(condition)).toEqual(["user.name"]);
  });

  test("extracts field path from equality op", () => {
    const condition = {
      kind: "op",
      op: "$eq",
      args: [
        { kind: "path", path: "status" },
        { kind: "literal", value: "active" },
      ],
    };
    expect(extractConditionDeps(condition)).toEqual(["status"]);
  });

  test("extracts multiple field paths from $and condition", () => {
    const condition = {
      kind: "op",
      op: "$and",
      args: [
        {
          kind: "op",
          op: "$eq",
          args: [
            { kind: "path", path: "a" },
            { kind: "literal", value: 1 },
          ],
        },
        {
          kind: "op",
          op: "$gt",
          args: [
            { kind: "path", path: "b" },
            { kind: "literal", value: 2 },
          ],
        },
      ],
    };
    const deps = extractConditionDeps(condition);
    expect(deps).toContain("a");
    expect(deps).toContain("b");
    expect(deps).toHaveLength(2);
  });

  test("extracts field paths from nested $or/$and", () => {
    const condition = {
      kind: "op",
      op: "$or",
      args: [
        {
          kind: "op",
          op: "$and",
          args: [
            {
              kind: "op",
              op: "$eq",
              args: [
                { kind: "path", path: "x" },
                { kind: "literal", value: 1 },
              ],
            },
            {
              kind: "op",
              op: "$eq",
              args: [
                { kind: "path", path: "y" },
                { kind: "literal", value: 2 },
              ],
            },
          ],
        },
        {
          kind: "op",
          op: "$eq",
          args: [
            { kind: "path", path: "z" },
            { kind: "literal", value: 3 },
          ],
        },
      ],
    };
    const deps = extractConditionDeps(condition);
    expect(deps).toContain("x");
    expect(deps).toContain("y");
    expect(deps).toContain("z");
    expect(deps).toHaveLength(3);
  });

  test("returns empty for condition with no field refs", () => {
    const condition = { kind: "literal", value: true };
    expect(extractConditionDeps(condition)).toEqual([]);
  });

  test("returns empty for null/undefined input", () => {
    expect(extractConditionDeps(null)).toEqual([]);
    expect(extractConditionDeps(undefined)).toEqual([]);
  });

  test("handles malformed nodes gracefully", () => {
    expect(extractConditionDeps({ kind: "unknown" })).toEqual([]);
    expect(extractConditionDeps("not an object")).toEqual([]);
    expect(extractConditionDeps(42)).toEqual([]);
  });

  test("deduplicates repeated field paths", () => {
    const condition = {
      kind: "op",
      op: "$and",
      args: [
        {
          kind: "op",
          op: "$gt",
          args: [
            { kind: "path", path: "x" },
            { kind: "literal", value: 1 },
          ],
        },
        {
          kind: "op",
          op: "$lt",
          args: [
            { kind: "path", path: "x" },
            { kind: "literal", value: 10 },
          ],
        },
      ],
    };
    expect(extractConditionDeps(condition)).toEqual(["x"]);
  });
});

describe("extractActionDeps", () => {
  test("extracts paths from $set stages", () => {
    const stages: readonly CompiledStage[] = [{ operator: "$set", entries: new Map([["total", 100]]) }];
    expect(extractActionDeps(stages)).toEqual(["total"]);
  });

  test("extracts paths from multiple stage types", () => {
    const stages: readonly CompiledStage[] = [
      { operator: "$set", entries: new Map([["a", true]]) },
      { operator: "$inc", entries: new Map([["b", 1]]) },
      { operator: "$push", entries: new Map([["c", "x"]]) },
      { operator: "$unset", entries: new Map([["d", ""]]) },
    ];
    const deps = extractActionDeps(stages);
    expect(deps).toHaveLength(4);
    expect(deps).toContain("a");
    expect(deps).toContain("d");
  });

  test("skips stages without paths ($focus)", () => {
    const stages: readonly CompiledStage[] = [{ operator: "$focus", entries: new Map([["group", "myGroup"]]) }];
    expect(extractActionDeps(stages)).toEqual([]);
  });

  test("returns empty for empty stages", () => {
    expect(extractActionDeps([])).toEqual([]);
  });
});
