import { ArbiterError, ArbiterErrorCode } from "./errors.js";
import type { FactPattern } from "./fact-pattern.js";

/**
 * Validates an array of fact patterns for a rule.
 * Throws ArbiterError on validation failure.
 */
export function validatePatterns(patterns: readonly FactPattern[], ruleName: string): void {
	if (!Array.isArray(patterns)) {
		throw new ArbiterError(ArbiterErrorCode.RULE_COMPILATION_FAILED, `Rule "${ruleName}" patterns must be an array`, {
			ruleName,
		});
	}

	const bindings = new Set<string>();

	for (let i = 0; i < patterns.length; i++) {
		const pattern = patterns[i];
		validateSinglePattern(pattern, ruleName, i, bindings);
		bindings.add(pattern.$bind);
	}
}

function validateSinglePattern(
	pattern: FactPattern,
	ruleName: string,
	index: number,
	previousBindings: Set<string>,
): void {
	if (!pattern || typeof pattern !== "object" || Array.isArray(pattern)) {
		throw new ArbiterError(
			ArbiterErrorCode.RULE_COMPILATION_FAILED,
			`Rule "${ruleName}" pattern[${index}] must be an object`,
			{ ruleName },
		);
	}

	if (!pattern.$fact || typeof pattern.$fact !== "string") {
		throw new ArbiterError(
			ArbiterErrorCode.RULE_COMPILATION_FAILED,
			`Rule "${ruleName}" pattern[${index}] must have a non-empty "$fact" string`,
			{ ruleName },
		);
	}

	if (!pattern.$bind || typeof pattern.$bind !== "string") {
		throw new ArbiterError(
			ArbiterErrorCode.RULE_COMPILATION_FAILED,
			`Rule "${ruleName}" pattern[${index}] must have a non-empty "$bind" string`,
			{ ruleName },
		);
	}

	if (previousBindings.has(pattern.$bind)) {
		throw new ArbiterError(
			ArbiterErrorCode.RULE_COMPILATION_FAILED,
			`Rule "${ruleName}" pattern[${index}] has duplicate $bind name "${pattern.$bind}"`,
			{ ruleName },
		);
	}

	if (pattern.$where !== undefined) {
		if (!pattern.$where || typeof pattern.$where !== "object" || Array.isArray(pattern.$where)) {
			throw new ArbiterError(
				ArbiterErrorCode.RULE_COMPILATION_FAILED,
				`Rule "${ruleName}" pattern[${index}] $where must be a non-null object`,
				{ ruleName },
			);
		}
	}

	if (pattern.$join !== undefined) {
		if (!pattern.$join || typeof pattern.$join !== "object" || Array.isArray(pattern.$join)) {
			throw new ArbiterError(
				ArbiterErrorCode.RULE_COMPILATION_FAILED,
				`Rule "${ruleName}" pattern[${index}] $join must be a non-null object`,
				{ ruleName },
			);
		}

		for (const [field, ref] of Object.entries(pattern.$join)) {
			if (typeof ref === "string") {
				if (!ref.startsWith("$")) {
					throw new ArbiterError(
						ArbiterErrorCode.RULE_COMPILATION_FAILED,
						`Rule "${ruleName}" pattern[${index}] $join["${field}"] must be a "$binding.path" reference`,
						{ ruleName },
					);
				}
				const bindingName = ref.slice(1).split(".")[0];
				if (!previousBindings.has(bindingName)) {
					throw new ArbiterError(
						ArbiterErrorCode.RULE_COMPILATION_FAILED,
						`Rule "${ruleName}" pattern[${index}] $join references unknown binding "${bindingName}"`,
						{ ruleName },
					);
				}
			} else if (typeof ref === "object" && ref !== null) {
				// Predicate object: validate each operator value
				for (const [op, val] of Object.entries(ref as Record<string, unknown>)) {
					if (typeof val !== "string" || !val.startsWith("$")) {
						throw new ArbiterError(
							ArbiterErrorCode.RULE_COMPILATION_FAILED,
							`Rule "${ruleName}" pattern[${index}] $join["${field}"].${op} must be a "$binding.path" reference`,
							{ ruleName },
						);
					}
					const bindingName = val.slice(1).split(".")[0];
					if (!previousBindings.has(bindingName)) {
						throw new ArbiterError(
							ArbiterErrorCode.RULE_COMPILATION_FAILED,
							`Rule "${ruleName}" pattern[${index}] $join references unknown binding "${bindingName}"`,
							{ ruleName },
						);
					}
				}
			} else {
				throw new ArbiterError(
					ArbiterErrorCode.RULE_COMPILATION_FAILED,
					`Rule "${ruleName}" pattern[${index}] $join["${field}"] must be a "$binding.path" reference or predicate object`,
					{ ruleName },
				);
			}
		}
	}
}
