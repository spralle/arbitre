export interface ArbiterLogger {
	debug(message: string, context?: Record<string, unknown>): void;
	info(message: string, context?: Record<string, unknown>): void;
	warn(message: string, context?: Record<string, unknown>): void;
	error(message: string, context?: Record<string, unknown>): void;
}

/** No-op logger — default when no logger is provided */
export const nullLogger: ArbiterLogger = {
	debug() {},
	info() {},
	warn() {},
	error() {},
};
