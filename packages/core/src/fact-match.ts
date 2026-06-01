import type { Fact } from "./fact-memory.js";

export function matchesFilter(data: Readonly<Record<string, unknown>>, filter: Record<string, unknown>): boolean {
	for (const key of Object.keys(filter)) {
		if (data[key] !== filter[key]) return false;
	}
	return true;
}

export function matchesFact(fact: Fact, factType: string, filter?: Record<string, unknown>): boolean {
	if (fact.type !== factType) return false;
	if (filter && !matchesFilter(fact.data, filter)) return false;
	return true;
}
