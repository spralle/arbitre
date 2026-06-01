// ---------------------------------------------------------------------------
// Validation for rule-level accumulate configurations.
// ---------------------------------------------------------------------------

import type { AccumulateConfig } from "./accumulate-node.js";
import { ArbiterError, ArbiterErrorCode } from "./errors.js";

const VALID_FNS = new Set(["$count", "$sum", "$avg", "$min", "$max", "$collect"]);
const FIELD_REQUIRED_FNS = new Set(["$sum", "$avg", "$min", "$max"]);

export function validateAccumulateConfigs(
	configs: readonly AccumulateConfig[],
	ruleName: string,
	customFnNames?: ReadonlySet<string>,
): void {
	const aliases = new Set<string>();

	for (const config of configs) {
		if (!config.factType || typeof config.factType !== "string") {
			throw new ArbiterError(
				ArbiterErrorCode.RULE_COMPILATION_FAILED,
				`Rule "${ruleName}" accumulate: factType must be a non-empty string`,
				{ ruleName },
			);
		}

		if (!config.fn || (!VALID_FNS.has(config.fn) && !customFnNames?.has(config.fn))) {
			throw new ArbiterError(
				ArbiterErrorCode.RULE_COMPILATION_FAILED,
				`Rule "${ruleName}" accumulate: fn must be one of count, sum, avg, min, max, collect (got "${config.fn}")`,
				{ ruleName },
			);
		}

		if (!config.alias || typeof config.alias !== "string") {
			throw new ArbiterError(
				ArbiterErrorCode.RULE_COMPILATION_FAILED,
				`Rule "${ruleName}" accumulate: alias must be a non-empty string`,
				{ ruleName },
			);
		}

		if (FIELD_REQUIRED_FNS.has(config.fn) && (!config.field || typeof config.field !== "string")) {
			throw new ArbiterError(
				ArbiterErrorCode.RULE_COMPILATION_FAILED,
				`Rule "${ruleName}" accumulate: field is required for fn "${config.fn}"`,
				{ ruleName },
			);
		}

		if (aliases.has(config.alias)) {
			throw new ArbiterError(
				ArbiterErrorCode.RULE_COMPILATION_FAILED,
				`Rule "${ruleName}" accumulate: duplicate alias "${config.alias}"`,
				{ ruleName },
			);
		}
		aliases.add(config.alias);
	}
}
