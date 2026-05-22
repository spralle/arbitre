// ---------------------------------------------------------------------------
// Fact type registration and validation for L2 multi-fact support.
// ---------------------------------------------------------------------------

export type FactFieldType = "string" | "number" | "boolean" | "object" | "array" | "unknown";

export interface FactTypeDefinition {
  readonly name: string;
  readonly fields: Readonly<Record<string, FactFieldType>>;
}

export interface FactRegistry {
  readonly register: (definition: FactTypeDefinition) => void;
  readonly has: (typeName: string) => boolean;
  readonly get: (typeName: string) => FactTypeDefinition | undefined;
  readonly getAll: () => readonly FactTypeDefinition[];
  readonly validate: (typeName: string, data: Readonly<Record<string, unknown>>) => readonly string[];
}

const FIELD_TYPE_CHECKERS: Record<FactFieldType, (value: unknown) => boolean> = {
  string: (v) => typeof v === "string",
  number: (v) => typeof v === "number",
  boolean: (v) => typeof v === "boolean",
  object: (v) => typeof v === "object" && v !== null && !Array.isArray(v),
  array: (v) => Array.isArray(v),
  unknown: () => true,
};

function validateFactData(definition: FactTypeDefinition, data: Readonly<Record<string, unknown>>): readonly string[] {
  const errors: string[] = [];
  const declaredFields = definition.fields;

  for (const [field, expectedType] of Object.entries(declaredFields)) {
    if (!(field in data)) {
      errors.push(`Missing field "${field}" expected by fact type "${definition.name}".`);
      continue;
    }
    const checker = FIELD_TYPE_CHECKERS[expectedType];
    if (!checker(data[field])) {
      errors.push(`Field "${field}" expected type "${expectedType}" but got "${typeof data[field]}".`);
    }
  }

  return errors;
}

export function createFactRegistry(): FactRegistry {
  const types = new Map<string, FactTypeDefinition>();

  const register = (definition: FactTypeDefinition): void => {
    if (types.has(definition.name)) {
      throw new Error(`Fact type "${definition.name}" is already registered.`);
    }
    types.set(definition.name, definition);
  };

  const has = (typeName: string): boolean => types.has(typeName);

  const get = (typeName: string): FactTypeDefinition | undefined => types.get(typeName);

  const getAll = (): readonly FactTypeDefinition[] => [...types.values()];

  const validate = (typeName: string, data: Readonly<Record<string, unknown>>): readonly string[] => {
    const definition = types.get(typeName);
    if (!definition) {
      return [`Unknown fact type "${typeName}".`];
    }
    return validateFactData(definition, data);
  };

  return { register, has, get, getAll, validate };
}
