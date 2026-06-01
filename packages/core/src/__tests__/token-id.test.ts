import { describe, expect, it } from "vitest";
import { createTokenIdGenerator } from "../token-id.js";

describe("createTokenIdGenerator", () => {
	it("produces unique sequential IDs", () => {
		const gen = createTokenIdGenerator();
		expect(gen()).toBe("token-1");
		expect(gen()).toBe("token-2");
		expect(gen("beta-token")).toBe("beta-token-3");
	});

	it("each generator has its own counter (isolated)", () => {
		const gen1 = createTokenIdGenerator();
		const gen2 = createTokenIdGenerator();
		expect(gen1()).toBe("token-1");
		expect(gen2()).toBe("token-1");
		expect(gen1()).toBe("token-2");
		expect(gen2()).toBe("token-2");
	});
});
