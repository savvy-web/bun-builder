import type { WarningSuppressionRule } from "../../types/builder-types.js";

/**
 * Parsed form of a suppression rule with the regex pre-compiled.
 * @internal
 */
interface CompiledRule {
	messageId: string | undefined;
	regex: RegExp | null;
	literal: string | undefined;
}

/**
 * Compiles a WarningSuppressionRule into its internal form.
 * Attempts to parse `pattern` as a RegExp; falls back to literal substring.
 */
function compileRule(rule: WarningSuppressionRule): CompiledRule {
	let regex: RegExp | null = null;
	let literal: string | undefined;

	if (rule.pattern !== undefined) {
		try {
			regex = new RegExp(rule.pattern);
		} catch {
			literal = rule.pattern;
		}
	}

	return { messageId: rule.messageId, regex, literal };
}

/**
 * Tests whether a compiled rule matches the given message fields.
 * Both conditions must match when both are specified (AND logic).
 */
function matchesCompiled(rule: CompiledRule, messageId: string | undefined, text: string | undefined): boolean {
	if (rule.messageId !== undefined && messageId !== rule.messageId) {
		return false;
	}

	if (rule.regex !== null) {
		return rule.regex.test(text ?? "");
	}

	if (rule.literal !== undefined) {
		return (text ?? "").includes(rule.literal);
	}

	return true;
}

/**
 * Tests whether a single rule matches the given message fields.
 * Both conditions must match when both are specified (AND logic).
 * @param rule - The suppression rule to test
 * @param messageId - The API Extractor message identifier
 * @param text - The message text
 * @returns true if the rule matches the message
 * @internal
 */
export function matchesSuppression(
	rule: WarningSuppressionRule,
	messageId: string | undefined,
	text: string | undefined,
): boolean {
	return matchesCompiled(compileRule(rule), messageId, text);
}

/**
 * A compiled suppressor that pre-parses all rule patterns once at creation.
 * @internal
 */
export interface MessageSuppressor {
	/** Returns true if the message matches any suppression rule. */
	matches(messageId: string | undefined, text: string | undefined): boolean;
}

/**
 * Creates a MessageSuppressor from an array of WarningSuppressionRule objects.
 * RegExp patterns are compiled once at factory time, not per-message.
 * @param rules - Declarative suppression rules from ApiModelOptions.suppressWarnings
 * @returns A MessageSuppressor instance
 * @internal
 */
export function createMessageSuppressor(rules: WarningSuppressionRule[]): MessageSuppressor {
	const compiled = rules.map(compileRule);

	return {
		matches(messageId: string | undefined, text: string | undefined): boolean {
			return compiled.some((rule) => matchesCompiled(rule, messageId, text));
		},
	};
}
