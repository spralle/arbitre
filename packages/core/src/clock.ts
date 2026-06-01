/**
 * Clock abstraction for temporal reasoning in the rule engine.
 * Allows deterministic testing with virtual clocks while supporting real-time in production.
 */

import { ArbiterError, ArbiterErrorCode } from "./errors.js";

export interface ArbiterClock {
	readonly now: () => number;
}

export interface VirtualClock extends ArbiterClock {
	readonly advance: (ms: number) => void;
	readonly setTime: (time: number) => void;
}

export function createRealClock(): ArbiterClock {
	return { now: () => Date.now() };
}

export function createVirtualClock(startTime = 0): VirtualClock {
	let current = startTime;

	return {
		now: () => current,
		advance(ms: number) {
			if (ms < 0) {
				throw new ArbiterError(ArbiterErrorCode.INVALID_CLOCK_OPERATION, "Cannot advance clock by a negative amount");
			}
			current += ms;
		},
		setTime(time: number) {
			if (time < current) {
				throw new ArbiterError(
					ArbiterErrorCode.INVALID_CLOCK_OPERATION,
					"Cannot set clock to a time before the current time",
				);
			}
			current = time;
		},
	};
}
