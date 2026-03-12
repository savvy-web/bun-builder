import { describe, expect, test } from "bun:test";
import type { WarningSuppressionRule } from "../../types/builder-types.js";
import { createMessageSuppressor, matchesSuppression } from "./message-suppressor.js";

describe("matchesSuppression", () => {
	test("matches everything when rule has no criteria", () => {
		const rule: WarningSuppressionRule = {};
		expect(matchesSuppression(rule, "ae-forgotten-export", "some text")).toBe(true);
	});

	describe("messageId-only rules", () => {
		const rule: WarningSuppressionRule = { messageId: "ae-forgotten-export" };

		test("matches when messageId matches exactly", () => {
			expect(matchesSuppression(rule, "ae-forgotten-export", undefined)).toBe(true);
		});

		test("does not match when messageId differs", () => {
			expect(matchesSuppression(rule, "tsdoc-param-tag-missing-hyphen", undefined)).toBe(false);
		});

		test("does not match when messageId is undefined", () => {
			expect(matchesSuppression(rule, undefined, "some text")).toBe(false);
		});
	});

	describe("pattern-only rules (RegExp)", () => {
		const rule: WarningSuppressionRule = { pattern: "MyInternalType" };

		test("matches when text contains the pattern", () => {
			expect(matchesSuppression(rule, undefined, 'Symbol "MyInternalType" is not exported')).toBe(true);
		});

		test("does not match when text does not contain the pattern", () => {
			expect(matchesSuppression(rule, undefined, 'Symbol "OtherType" is not exported')).toBe(false);
		});

		test("treats undefined text as empty string", () => {
			expect(matchesSuppression(rule, undefined, undefined)).toBe(false);
		});
	});

	describe("pattern-only rules (RegExp with anchors)", () => {
		const rule: WarningSuppressionRule = { pattern: "^Analysis will use" };

		test("matches at start of text", () => {
			expect(matchesSuppression(rule, undefined, "Analysis will use the bundled TypeScript version")).toBe(true);
		});

		test("does not match when pattern is not at start", () => {
			expect(matchesSuppression(rule, undefined, "Note: Analysis will use")).toBe(false);
		});
	});

	describe("pattern-only rules (invalid RegExp falls back to substring)", () => {
		const rule: WarningSuppressionRule = { pattern: "[invalid(" };

		test("falls back to substring match when regex is invalid", () => {
			expect(matchesSuppression(rule, undefined, "text containing [invalid( here")).toBe(true);
		});

		test("does not match when substring is absent", () => {
			expect(matchesSuppression(rule, undefined, "no match here")).toBe(false);
		});
	});

	describe("messageId AND pattern rules (both must match)", () => {
		const rule: WarningSuppressionRule = {
			messageId: "ae-forgotten-export",
			pattern: "_base",
		};

		test("matches when both messageId and pattern match", () => {
			expect(matchesSuppression(rule, "ae-forgotten-export", 'The symbol "_base" needs to be exported')).toBe(true);
		});

		test("does not match when messageId matches but pattern does not", () => {
			expect(matchesSuppression(rule, "ae-forgotten-export", 'The symbol "OtherType" needs to be exported')).toBe(
				false,
			);
		});

		test("does not match when pattern matches but messageId does not", () => {
			expect(
				matchesSuppression(rule, "tsdoc-param-tag-missing-hyphen", 'The symbol "_base" needs to be exported'),
			).toBe(false);
		});

		test("does not match when neither matches", () => {
			expect(
				matchesSuppression(rule, "tsdoc-param-tag-missing-hyphen", 'The symbol "OtherType" needs to be exported'),
			).toBe(false);
		});
	});
});

describe("createMessageSuppressor", () => {
	test("returns false for any message when rules array is empty", () => {
		const suppressor = createMessageSuppressor([]);
		expect(suppressor.matches("ae-forgotten-export", "some text")).toBe(false);
	});

	test("matches when first rule matches", () => {
		const suppressor = createMessageSuppressor([{ messageId: "ae-forgotten-export" }]);
		expect(suppressor.matches("ae-forgotten-export", "some text")).toBe(true);
	});

	test("matches when second rule matches but first does not", () => {
		const suppressor = createMessageSuppressor([
			{ messageId: "ae-unresolved-link" },
			{ pattern: "TypeScript version" },
		]);
		expect(suppressor.matches("ae-forgotten-export", "TypeScript version 5.x is bundled")).toBe(true);
	});

	test("does not match when no rules match", () => {
		const suppressor = createMessageSuppressor([
			{ messageId: "ae-unresolved-link" },
			{ pattern: "TypeScript version" },
		]);
		expect(suppressor.matches("ae-forgotten-export", "completely different text")).toBe(false);
	});

	test("pre-compiles regex: same instance handles multiple messages correctly", () => {
		const suppressor = createMessageSuppressor([{ pattern: "^Error:" }]);
		expect(suppressor.matches(undefined, "Error: something failed")).toBe(true);
		expect(suppressor.matches(undefined, "Warning: something else")).toBe(false);
		expect(suppressor.matches(undefined, "Error: another failure")).toBe(true);
	});

	test("empty rule object matches any message", () => {
		const suppressor = createMessageSuppressor([{}]);
		expect(suppressor.matches(undefined, undefined)).toBe(true);
		expect(suppressor.matches("any-id", "any text")).toBe(true);
	});
});
