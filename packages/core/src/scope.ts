import { collectPath } from "kuery";
import type { WriteRecord } from "./contracts.js";
import { ArbiterError, ArbiterErrorCode } from "./errors.js";
import { splitPath, validatePath } from "./path-utils.js";

// ---------------------------------------------------------------------------
// Namespace types and routing
// ---------------------------------------------------------------------------

export type Namespace = "root" | "$ui" | "$state" | "$meta" | "$contributions";

const NAMESPACE_PREFIXES: readonly { readonly prefix: string; readonly namespace: Namespace }[] = [
  { prefix: "$contributions.", namespace: "$contributions" },
  { prefix: "$state.", namespace: "$state" },
  { prefix: "$meta.", namespace: "$meta" },
  { prefix: "$ui.", namespace: "$ui" },
];

const BARE_NAMESPACES: ReadonlySet<string> = new Set(["$ui", "$state", "$meta", "$contributions"]);

export interface ScopeManager {
  readonly get: (path: string) => unknown;
  readonly set: (path: string, value: unknown, ruleName: string) => WriteRecord | undefined;
  readonly unset: (path: string, ruleName: string) => WriteRecord | undefined;
  readonly push: (path: string, value: unknown, ruleName: string) => WriteRecord | undefined;
  readonly inc: (path: string, amount: unknown, ruleName: string) => WriteRecord | undefined;
  readonly merge: (path: string, value: unknown, ruleName: string) => WriteRecord | undefined;
  readonly getWriteRecords: (ruleName: string) => readonly WriteRecord[];
  readonly revertRule: (ruleName: string) => readonly string[];
  readonly clearWriteRecords: (ruleName: string) => void;
  readonly getState: () => Readonly<Record<string, unknown>>;
  readonly getReadView: () => Readonly<Record<string, unknown>>;
  readonly snapshot: () => unknown;
  readonly resolveNamespace: (path: string) => { namespace: Namespace; localPath: string };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveNamespace(path: string): { namespace: Namespace; localPath: string } {
  for (const { prefix, namespace } of NAMESPACE_PREFIXES) {
    if (path.startsWith(prefix)) {
      return { namespace, localPath: path.slice(prefix.length) };
    }
  }
  if (BARE_NAMESPACES.has(path)) {
    return { namespace: path as Namespace, localPath: "" };
  }
  return { namespace: "root", localPath: path };
}

function deepGet(obj: Record<string, unknown>, segments: readonly string[]): unknown {
  return collectPath(obj, segments);
}

function deepSet(obj: Record<string, unknown>, segments: readonly string[], value: unknown): void {
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    const next = current[seg];
    if (next === null || next === undefined || typeof next !== "object" || Array.isArray(next)) {
      const created: Record<string, unknown> = {};
      current[seg] = created;
      current = created;
    } else {
      current = next as Record<string, unknown>;
    }
  }
  current[segments[segments.length - 1]!] = value;
}

function deepDelete(obj: Record<string, unknown>, segments: readonly string[]): void {
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]!;
    const next = current[seg];
    if (next === null || next === undefined || typeof next !== "object") {
      return;
    }
    current = next as Record<string, unknown>;
  }
  delete current[segments[segments.length - 1]!];
}

function snapshotKey(ruleName: string, path: string): string {
  return `${ruleName}:${path}`;
}

function safeClone(value: unknown): unknown {
  if (value === undefined) return undefined;
  return structuredClone(value);
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createScopeManager(initialState?: Readonly<Record<string, unknown>>): ScopeManager {
  const stores: Record<Namespace, Record<string, unknown>> = {
    root: initialState ? (structuredClone(initialState) as Record<string, unknown>) : {},
    $ui: {},
    $state: {},
    $meta: {},
    $contributions: {},
  };

  const provenanceMap = new Map<string, WriteRecord[]>();
  const snapshots = new Map<string, unknown>();

  function getStore(ns: Namespace): Record<string, unknown> {
    return stores[ns];
  }

  function readPath(path: string): unknown {
    validatePath(path);
    const { namespace, localPath } = resolveNamespace(path);
    if (localPath === "") return getStore(namespace);
    return deepGet(getStore(namespace), splitPath(localPath));
  }

  function recordWrite(path: string, value: unknown, snapshotValue: unknown, ruleName: string): WriteRecord {
    const _record: WriteRecord = { path, value, snapshotValue, ruleName };
    const key = snapshotKey(ruleName, path);
    if (!snapshots.has(key)) {
      snapshots.set(key, safeClone(snapshotValue));
    }
    let records = provenanceMap.get(ruleName);
    if (!records) {
      records = [];
      provenanceMap.set(ruleName, records);
    }
    // Use the original snapshot for the record
    const finalRecord: WriteRecord = {
      path,
      value,
      snapshotValue: snapshots.get(key),
      ruleName,
    };
    records.push(finalRecord);
    return finalRecord;
  }

  function writePath(path: string, value: unknown, ruleName: string): WriteRecord | undefined {
    validatePath(path);
    const { namespace, localPath } = resolveNamespace(path);
    if (localPath === "") return undefined;
    const segments = splitPath(localPath);
    const prev = deepGet(getStore(namespace), segments);
    deepSet(getStore(namespace), segments, value);
    return recordWrite(path, value, prev, ruleName);
  }

  function unsetPath(path: string, ruleName: string): WriteRecord | undefined {
    validatePath(path);
    const { namespace, localPath } = resolveNamespace(path);
    if (localPath === "") return undefined;
    const segments = splitPath(localPath);
    const prev = deepGet(getStore(namespace), segments);
    deepDelete(getStore(namespace), segments);
    return recordWrite(path, undefined, prev, ruleName);
  }

  function pushPath(path: string, value: unknown, ruleName: string): WriteRecord | undefined {
    validatePath(path);
    const { namespace, localPath } = resolveNamespace(path);
    if (localPath === "") return undefined;
    const segments = splitPath(localPath);
    const store = getStore(namespace);
    const current = deepGet(store, segments);
    const arr = Array.isArray(current) ? [...current, value] : [value];
    const prev = current;
    deepSet(store, segments, arr);
    return recordWrite(path, arr, prev, ruleName);
  }

  function incPath(path: string, amount: unknown, ruleName: string): WriteRecord | undefined {
    validatePath(path);
    if (typeof amount !== "number") {
      throw new ArbiterError(
        ArbiterErrorCode.EXPRESSION_EVAL_FAILED,
        `inc requires a numeric amount, got ${typeof amount}`,
      );
    }
    const { namespace, localPath } = resolveNamespace(path);
    if (localPath === "") return undefined;
    const segments = splitPath(localPath);
    const store = getStore(namespace);
    const current = deepGet(store, segments);
    const prev = current;
    const base = typeof current === "number" ? current : 0;
    const newVal = base + amount;
    deepSet(store, segments, newVal);
    return recordWrite(path, newVal, prev, ruleName);
  }

  function mergePath(path: string, value: unknown, ruleName: string): WriteRecord | undefined {
    validatePath(path);
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new ArbiterError(ArbiterErrorCode.EXPRESSION_EVAL_FAILED, "merge requires a plain object value");
    }
    const { namespace, localPath } = resolveNamespace(path);
    if (localPath === "") return undefined;
    const segments = splitPath(localPath);
    const store = getStore(namespace);
    const current = deepGet(store, segments);
    const prev = safeClone(current);
    const base =
      current !== null && typeof current === "object" && !Array.isArray(current)
        ? (current as Record<string, unknown>)
        : {};
    const merged = { ...base, ...(value as Record<string, unknown>) };
    deepSet(store, segments, merged);
    return recordWrite(path, merged, prev, ruleName);
  }

  function getWriteRecords(ruleName: string): readonly WriteRecord[] {
    return provenanceMap.get(ruleName) ?? [];
  }

  function revertRule(ruleName: string): readonly string[] {
    const records = provenanceMap.get(ruleName);
    if (!records || records.length === 0) return [];
    const paths: string[] = [];
    for (const record of records) {
      const { namespace, localPath } = resolveNamespace(record.path);
      if (localPath === "") continue;
      const segments = splitPath(localPath);
      if (record.snapshotValue === undefined) {
        deepDelete(getStore(namespace), segments);
      } else {
        deepSet(getStore(namespace), segments, structuredClone(record.snapshotValue));
      }
      paths.push(record.path);
    }
    provenanceMap.delete(ruleName);
    // Clean up snapshots for this rule
    for (const key of [...snapshots.keys()]) {
      if (key.startsWith(`${ruleName}:`)) {
        snapshots.delete(key);
      }
    }
    return paths;
  }

  function clearWriteRecords(ruleName: string): void {
    provenanceMap.delete(ruleName);
    for (const key of [...snapshots.keys()]) {
      if (key.startsWith(`${ruleName}:`)) {
        snapshots.delete(key);
      }
    }
  }

  function getState(): Readonly<Record<string, unknown>> {
    const result: Record<string, unknown> = { ...structuredClone(stores.root) };
    for (const ns of ["$ui", "$state", "$meta", "$contributions"] as const) {
      if (Object.keys(stores[ns]).length > 0) {
        result[ns] = structuredClone(stores[ns]);
      }
    }
    return result;
  }

  function snapshotState(): unknown {
    return structuredClone(stores);
  }

  function getReadView(): Readonly<Record<string, unknown>> {
    const result: Record<string, unknown> = { ...stores.root };
    for (const ns of ["$ui", "$state", "$meta", "$contributions"] as const) {
      if (Object.keys(stores[ns]).length > 0) {
        result[ns] = stores[ns];
      }
    }
    return result;
  }

  return {
    get: readPath,
    set: writePath,
    unset: unsetPath,
    push: pushPath,
    inc: incPath,
    merge: mergePath,
    getWriteRecords,
    revertRule,
    clearWriteRecords,
    getState,
    getReadView,
    snapshot: snapshotState,
    resolveNamespace,
  };
}
