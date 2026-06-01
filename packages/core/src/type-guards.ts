/** Type guard: checks if a value is a non-null, non-array object (Record-like). */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
