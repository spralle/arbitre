import { describe, expect, test } from "vitest";
import type { FactTypeDefinition } from "../fact-registry.js";
import { createFactRegistry } from "../fact-registry.js";

const personDef: FactTypeDefinition = {
  name: "Person",
  fields: { name: "string", age: "number", active: "boolean" },
};

describe("FactRegistry", () => {
  test("register a fact type", () => {
    const registry = createFactRegistry();
    registry.register(personDef);
    expect(registry.has("Person")).toBe(true);
  });

  test("has returns true for registered type", () => {
    const registry = createFactRegistry();
    registry.register(personDef);
    expect(registry.has("Person")).toBe(true);
  });

  test("has returns false for unregistered type", () => {
    const registry = createFactRegistry();
    expect(registry.has("Unknown")).toBe(false);
  });

  test("get returns definition", () => {
    const registry = createFactRegistry();
    registry.register(personDef);
    expect(registry.get("Person")).toEqual(personDef);
  });

  test("getAll returns all definitions", () => {
    const registry = createFactRegistry();
    registry.register(personDef);
    registry.register({ name: "Order", fields: { total: "number" } });
    expect(registry.getAll()).toHaveLength(2);
  });

  test("duplicate registration throws", () => {
    const registry = createFactRegistry();
    registry.register(personDef);
    expect(() => registry.register(personDef)).toThrow("already registered");
  });

  test("validate returns empty for valid data", () => {
    const registry = createFactRegistry();
    registry.register(personDef);
    const errors = registry.validate("Person", { name: "Alice", age: 30, active: true });
    expect(errors).toEqual([]);
  });

  test("validate returns errors for wrong type", () => {
    const registry = createFactRegistry();
    registry.register(personDef);
    const errors = registry.validate("Person", { name: "Alice", age: "thirty", active: true });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("age");
  });

  test("validate returns errors for missing required field", () => {
    const registry = createFactRegistry();
    registry.register(personDef);
    const errors = registry.validate("Person", { name: "Alice" });
    expect(errors).toHaveLength(2); // age + active missing
    expect(errors.some((e) => e.includes("age"))).toBe(true);
    expect(errors.some((e) => e.includes("active"))).toBe(true);
  });
});
