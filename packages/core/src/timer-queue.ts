// ---------------------------------------------------------------------------
// Timer Queue — scheduled rule activations (one-shot and repeating)
// ---------------------------------------------------------------------------

export interface ScheduleOptions {
	/** Delay in milliseconds from current time */
	readonly delay: number;
	/** If true, timer repeats at this interval */
	readonly repeat?: boolean;
}

export interface TimerEntry {
	readonly ruleName: string;
	readonly fireAt: number;
	readonly repeat: boolean;
	readonly interval: number;
}

export interface TimerQueue {
	/** Schedule a rule to fire after delay */
	readonly schedule: (ruleName: string, options: ScheduleOptions, currentTime: number) => void;
	/** Cancel a scheduled timer */
	readonly cancel: (ruleName: string) => void;
	/** Get all timers that are due (fireAt <= now) */
	readonly getDueTimers: (now: number) => readonly TimerEntry[];
	/** Advance due timers: remove one-shots, reschedule repeating. Returns rule names that fired. */
	readonly advanceDueTimers: (now: number) => readonly string[];
	/** Get all scheduled timers */
	readonly getAll: () => readonly TimerEntry[];
}

export function createTimerQueue(): TimerQueue {
	const timers = new Map<string, TimerEntry>();

	function schedule(ruleName: string, options: ScheduleOptions, currentTime: number): void {
		timers.set(ruleName, {
			ruleName,
			fireAt: currentTime + options.delay,
			repeat: options.repeat ?? false,
			interval: options.delay,
		});
	}

	function cancel(ruleName: string): void {
		timers.delete(ruleName);
	}

	function getDueTimers(now: number): readonly TimerEntry[] {
		const due: TimerEntry[] = [];
		for (const entry of timers.values()) {
			if (entry.fireAt <= now) {
				due.push(entry);
			}
		}
		return due;
	}

	function advanceDueTimers(now: number): readonly string[] {
		const firedNames: string[] = [];
		for (const entry of timers.values()) {
			if (entry.fireAt <= now) {
				firedNames.push(entry.ruleName);
				if (entry.repeat) {
					timers.set(entry.ruleName, {
						...entry,
						fireAt: entry.fireAt + entry.interval,
					});
				} else {
					timers.delete(entry.ruleName);
				}
			}
		}
		return firedNames;
	}

	function getAll(): readonly TimerEntry[] {
		return [...timers.values()];
	}

	return { schedule, cancel, getDueTimers, advanceDueTimers, getAll };
}
