// ---------------------------------------------------------------------------
// Working memory for typed facts (L2 multi-fact support).
// ---------------------------------------------------------------------------

export interface Fact {
  readonly id: string;
  readonly type: string;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface FactMemory {
  readonly assertFact: (type: string, data: Readonly<Record<string, unknown>>) => string;
  readonly retractFact: (factId: string) => Fact | undefined;
  readonly getFact: (factId: string) => Fact | undefined;
  readonly getFactsByType: (type: string) => readonly Fact[];
  readonly getAllFacts: () => readonly Fact[];
  readonly size: () => number;
  readonly clear: () => void;
}

export function createFactMemory(): FactMemory {
  const facts = new Map<string, Fact>();
  let counter = 0;

  const assertFact = (type: string, data: Readonly<Record<string, unknown>>): string => {
    const id = `fact-${counter++}`;
    const fact: Fact = { id, type, data };
    facts.set(id, fact);
    return id;
  };

  const retractFact = (factId: string): Fact | undefined => {
    const fact = facts.get(factId);
    if (fact) {
      facts.delete(factId);
    }
    return fact;
  };

  const getFact = (factId: string): Fact | undefined => facts.get(factId);

  const getFactsByType = (type: string): readonly Fact[] => [...facts.values()].filter((f) => f.type === type);

  const getAllFacts = (): readonly Fact[] => [...facts.values()];

  const size = (): number => facts.size;

  const clear = (): void => {
    facts.clear();
  };

  return { assertFact, retractFact, getFact, getFactsByType, getAllFacts, size, clear };
}
