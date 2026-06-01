import { compile } from "kuery/compile";
import type { CompiledStage, ThenStage } from "./contracts.js";
import { ArbiterError, ArbiterErrorCode } from "./errors.js";
import { validatePath } from "./path-utils.js";
import { isRecord } from "./type-guards.js";

/**
 * Extracts the single $-prefixed operator key and body from a pipeline stage.
 */
function extractOperator(stage: ThenStage<unknown>): { readonly operator: string; readonly body: unknown } {
	const keys = Object.keys(stage);
	const opKeys = keys.filter((k) => k.startsWith("$"));
	if (opKeys.length !== 1) {
		throw new ArbiterError(
			ArbiterErrorCode.RULE_COMPILATION_FAILED,
			`Then stage must have exactly one $-prefixed operator, got: ${opKeys.join(", ") || "none"}`,
		);
	}
	return { operator: opKeys[0], body: stage[opKeys[0]] };
}

/**
 * Compiles a single ThenStage into a CompiledStage.
 */
function compileStage(stage: ThenStage<unknown>): CompiledStage {
	const { operator, body } = extractOperator(stage);

	if (operator === "$focus") {
		if (!isRecord(body)) {
			throw new ArbiterError(ArbiterErrorCode.RULE_COMPILATION_FAILED, "$focus stage body must be an object");
		}
		const entries = new Map<string, unknown>();
		entries.set("group", body["group"]);
		return { operator, entries };
	}

	if (!isRecord(body)) {
		throw new ArbiterError(ArbiterErrorCode.RULE_COMPILATION_FAILED, `Stage body for "${operator}" must be an object`);
	}
	const entries = new Map<string, unknown>();

	for (const [path, value] of Object.entries(body)) {
		validatePath(path);
		if (operator === "$pull") {
			if (!isRecord(value)) {
				throw new ArbiterError(ArbiterErrorCode.RULE_COMPILATION_FAILED, "$pull value must be an object");
			}
			entries.set(path, compile(value));
		} else {
			entries.set(path, value);
		}
	}

	return { operator, entries };
}

/**
 * Compiles an array of ThenStage into CompiledStage[].
 */
export function compileThenActions(stages: readonly ThenStage<unknown>[]): readonly CompiledStage[] {
	return stages.map(compileStage);
}
