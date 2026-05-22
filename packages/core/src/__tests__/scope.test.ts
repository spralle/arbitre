import { describe, expect, it } from "vitest";
import { createScopeManager } from "../scope.js";

describe("ScopeManager", () => {
  describe("resolveNamespace", () => {
    it("routes plain path to root", () => {
      const scope = createScopeManager();
      expect(scope.resolveNamespace("firstName")).toEqual({
        namespace: "root",
        localPath: "firstName",
      });
    });

    it("routes dotted path to root", () => {
      const scope = createScopeManager();
      expect(scope.resolveNamespace("address.city")).toEqual({
        namespace: "root",
        localPath: "address.city",
      });
    });

    it("routes $ui prefixed path", () => {
      const scope = createScopeManager();
      expect(scope.resolveNamespace("$ui.firstName.visible")).toEqual({
        namespace: "$ui",
        localPath: "firstName.visible",
      });
    });

    it("routes $state prefixed path", () => {
      const scope = createScopeManager();
      expect(scope.resolveNamespace("$state.total")).toEqual({
        namespace: "$state",
        localPath: "total",
      });
    });

    it("routes $meta prefixed path", () => {
      const scope = createScopeManager();
      expect(scope.resolveNamespace("$meta.lastFired")).toEqual({
        namespace: "$meta",
        localPath: "lastFired",
      });
    });

    it("routes $contributions prefixed path", () => {
      const scope = createScopeManager();
      expect(scope.resolveNamespace("$contributions.copy.visible")).toEqual({
        namespace: "$contributions",
        localPath: "copy.visible",
      });
    });

    it("routes bare $ui to namespace with empty localPath", () => {
      const scope = createScopeManager();
      expect(scope.resolveNamespace("$ui")).toEqual({
        namespace: "$ui",
        localPath: "",
      });
    });
  });

  describe("read/write", () => {
    it("set and get a simple value", () => {
      const scope = createScopeManager();
      scope.set("name", "Alice", "r1");
      expect(scope.get("name")).toBe("Alice");
    });

    it("set creates nested objects", () => {
      const scope = createScopeManager();
      scope.set("address.city", "NYC", "r1");
      expect(scope.get("address.city")).toBe("NYC");
    });

    it("set writes to $ui namespace", () => {
      const scope = createScopeManager();
      scope.set("$ui.name.visible", true, "r1");
      expect(scope.get("$ui.name.visible")).toBe(true);
    });

    it("get on non-existent path returns undefined", () => {
      const scope = createScopeManager();
      expect(scope.get("nonexistent")).toBeUndefined();
    });

    it("deep nested path works", () => {
      const scope = createScopeManager();
      scope.set("a.b.c.d", 1, "r1");
      expect(scope.get("a.b.c.d")).toBe(1);
    });

    it("preserves initial state in root namespace", () => {
      const scope = createScopeManager({ name: "Bob", age: 30 });
      expect(scope.get("name")).toBe("Bob");
      expect(scope.get("age")).toBe(30);
    });
  });

  describe("operations", () => {
    it("unset removes a value", () => {
      const scope = createScopeManager({ name: "Alice" });
      scope.unset("name", "r1");
      expect(scope.get("name")).toBeUndefined();
    });

    it("push appends to array", () => {
      const scope = createScopeManager({ items: ["a"] });
      scope.push("items", "new", "r1");
      expect(scope.get("items")).toEqual(["a", "new"]);
    });

    it("push creates array if needed", () => {
      const scope = createScopeManager();
      scope.push("items", "first", "r1");
      expect(scope.get("items")).toEqual(["first"]);
    });

    it("inc increments a number", () => {
      const scope = createScopeManager({ count: 10 });
      scope.inc("count", 5, "r1");
      expect(scope.get("count")).toBe(15);
    });

    it("inc creates with value if path does not exist", () => {
      const scope = createScopeManager();
      scope.inc("count", 5, "r1");
      expect(scope.get("count")).toBe(5);
    });

    it("merge merges objects", () => {
      const scope = createScopeManager({ config: { a: 1 } });
      scope.merge("config", { b: 2 }, "r1");
      expect(scope.get("config")).toEqual({ a: 1, b: 2 });
    });

    it("merge creates object if path does not exist", () => {
      const scope = createScopeManager();
      scope.merge("config", { a: 1 }, "r1");
      expect(scope.get("config")).toEqual({ a: 1 });
    });
  });

  describe("provenance", () => {
    it("getWriteRecords returns all writes by a rule", () => {
      const scope = createScopeManager();
      scope.set("a", 1, "r1");
      scope.set("b", 2, "r1");
      const records = scope.getWriteRecords("r1");
      expect(records).toHaveLength(2);
      expect(records[0]?.path).toBe("a");
      expect(records[1]?.path).toBe("b");
    });

    it("WriteRecord has correct snapshotValue", () => {
      const scope = createScopeManager({ name: "Alice" });
      const record = scope.set("name", "Bob", "r1");
      expect(record?.snapshotValue).toBe("Alice");
    });

    it("second write by same rule to same path keeps original snapshot", () => {
      const scope = createScopeManager({ name: "Alice" });
      scope.set("name", "Bob", "r1");
      scope.set("name", "Charlie", "r1");
      const records = scope.getWriteRecords("r1");
      // Both records should have 'Alice' as snapshot (the value before first write)
      expect(records[0]?.snapshotValue).toBe("Alice");
      expect(records[1]?.snapshotValue).toBe("Alice");
    });

    it("getWriteRecords returns empty for unknown rule", () => {
      const scope = createScopeManager();
      expect(scope.getWriteRecords("unknown")).toEqual([]);
    });
  });

  describe("TMS revert", () => {
    it("revertRule restores paths to snapshot values", () => {
      const scope = createScopeManager({ name: "Alice", age: 25 });
      scope.set("name", "Bob", "r1");
      scope.set("age", 30, "r1");
      scope.revertRule("r1");
      expect(scope.get("name")).toBe("Alice");
      expect(scope.get("age")).toBe(25);
    });

    it("revertRule returns affected paths", () => {
      const scope = createScopeManager();
      scope.set("a", 1, "r1");
      scope.set("b", 2, "r1");
      const paths = scope.revertRule("r1");
      expect(paths).toEqual(["a", "b"]);
    });

    it("revertRule deletes paths that had no prior value", () => {
      const scope = createScopeManager();
      scope.set("newField", "value", "r1");
      scope.revertRule("r1");
      expect(scope.get("newField")).toBeUndefined();
    });

    it("revertRule returns empty for unknown rule", () => {
      const scope = createScopeManager();
      expect(scope.revertRule("unknown")).toEqual([]);
    });

    it("clearWriteRecords removes tracking data", () => {
      const scope = createScopeManager();
      scope.set("a", 1, "r1");
      scope.clearWriteRecords("r1");
      expect(scope.getWriteRecords("r1")).toEqual([]);
    });
  });

  describe("getState", () => {
    it("returns merged view of all namespaces", () => {
      const scope = createScopeManager({ name: "Alice" });
      scope.set("$ui.name.visible", true, "r1");
      const state = scope.getState();
      expect(state["name"]).toBe("Alice");
      expect((state["$ui"] as Record<string, unknown>)["name"]).toEqual({ visible: true });
    });

    it("initial state is preserved in root namespace", () => {
      const initial = { x: 1, y: 2 };
      const scope = createScopeManager(initial);
      const state = scope.getState();
      expect(state["x"]).toBe(1);
      expect(state["y"]).toBe(2);
    });
  });

  describe("getReadView", () => {
    it("returns same data as getState", () => {
      const scope = createScopeManager({ x: 1, nested: { a: 2 } });
      scope.set("$ui.visible", true, "test");

      const view = scope.getReadView();
      const state = scope.getState();

      expect(view.x).toBe(state.x);
      expect(view.nested).toEqual(state.nested);
      expect((view.$ui as Record<string, unknown>).visible).toBe(true);
    });

    it("reflects current state without cloning", () => {
      const scope = createScopeManager({ x: 1 });
      const view1 = scope.getReadView();
      expect(view1.x).toBe(1);

      scope.set("x", 2, "test");
      const view2 = scope.getReadView();
      expect(view2.x).toBe(2);
    });
  });
});
