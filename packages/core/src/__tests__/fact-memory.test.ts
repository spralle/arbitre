import { describe, expect, test } from "vitest";
import { createFactMemory } from "../fact-memory.js";

describe("FactMemory", () => {
  test("assertFact returns a unique factId", () => {
    const mem = createFactMemory();
    const id1 = mem.assertFact("Person", { name: "Alice" });
    const id2 = mem.assertFact("Person", { name: "Bob" });
    expect(id1).not.toBe(id2);
  });

  test("getFact returns the asserted fact", () => {
    const mem = createFactMemory();
    const id = mem.assertFact("Person", { name: "Alice" });
    const fact = mem.getFact(id);
    expect(fact).toBeDefined();
    expect(fact?.type).toBe("Person");
    expect(fact?.data).toEqual({ name: "Alice" });
  });

  test("retractFact removes and returns the fact", () => {
    const mem = createFactMemory();
    const id = mem.assertFact("Person", { name: "Alice" });
    const retracted = mem.retractFact(id);
    expect(retracted).toBeDefined();
    expect(retracted?.id).toBe(id);
    expect(mem.getFact(id)).toBeUndefined();
  });

  test("retractFact returns undefined for non-existent id", () => {
    const mem = createFactMemory();
    expect(mem.retractFact("fact-999")).toBeUndefined();
  });

  test("getFactsByType returns correct facts", () => {
    const mem = createFactMemory();
    mem.assertFact("Person", { name: "Alice" });
    mem.assertFact("Order", { total: 100 });
    mem.assertFact("Person", { name: "Bob" });
    const people = mem.getFactsByType("Person");
    expect(people).toHaveLength(2);
  });

  test("getFactsByType returns empty for unknown type", () => {
    const mem = createFactMemory();
    expect(mem.getFactsByType("Unknown")).toEqual([]);
  });

  test("getAllFacts returns everything", () => {
    const mem = createFactMemory();
    mem.assertFact("Person", { name: "Alice" });
    mem.assertFact("Order", { total: 50 });
    expect(mem.getAllFacts()).toHaveLength(2);
  });

  test("size reflects current count", () => {
    const mem = createFactMemory();
    expect(mem.size()).toBe(0);
    mem.assertFact("Person", { name: "Alice" });
    expect(mem.size()).toBe(1);
    mem.assertFact("Order", { total: 50 });
    expect(mem.size()).toBe(2);
  });

  test("clear removes all facts", () => {
    const mem = createFactMemory();
    mem.assertFact("Person", { name: "Alice" });
    mem.assertFact("Order", { total: 50 });
    mem.clear();
    expect(mem.size()).toBe(0);
    expect(mem.getAllFacts()).toEqual([]);
  });
});
