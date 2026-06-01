export type TokenIdGenerator = (prefix?: string) => string;

export function createTokenIdGenerator(): TokenIdGenerator {
	let counter = 0;
	return (prefix = "token") => `${prefix}-${++counter}`;
}

// Default shared generator for backward compatibility
const defaultGenerator = createTokenIdGenerator();

export function generateTokenId(prefix = "token"): string {
	return defaultGenerator(prefix);
}

export function resetTokenCounter(): void {
	// No-op: kept for backward compatibility. Use createTokenIdGenerator() for isolated counters.
}
