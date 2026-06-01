/**
 * Tracks rule activation times and determines which rules have expired
 * based on their configured `expires` duration.
 */

export interface ExpiryTracker {
	/** Record that a rule was activated at a given time */
	readonly onRuleActivated: (ruleName: string, activatedAt: number) => void;
	/** Check which rules have expired given current time */
	readonly getExpiredRules: (now: number) => readonly string[];
	/** Remove tracking for a rule (on manual deactivation or re-activation reset) */
	readonly reset: (ruleName: string) => void;
	/** Clear all tracking */
	readonly clear: () => void;
}

export function createExpiryTracker(ruleExpiries: ReadonlyMap<string, number>): ExpiryTracker {
	const activations = new Map<string, number>();

	function onRuleActivated(ruleName: string, activatedAt: number): void {
		if (!ruleExpiries.has(ruleName)) return;
		if (activations.has(ruleName)) return;
		activations.set(ruleName, activatedAt);
	}

	function getExpiredRules(now: number): readonly string[] {
		const expired: string[] = [];
		for (const [ruleName, activatedAt] of activations) {
			const duration = ruleExpiries.get(ruleName);
			if (duration !== undefined && now - activatedAt >= duration) {
				expired.push(ruleName);
			}
		}
		return expired;
	}

	function reset(ruleName: string): void {
		activations.delete(ruleName);
	}

	function clear(): void {
		activations.clear();
	}

	return { onRuleActivated, getExpiredRules, reset, clear };
}
