import { count } from "./shared.js";

/**
 * Summarize items.
 * @param items - Items to summarize
 * @returns Summary string
 * @public
 */
export function summarize(items: string[]): string {
	return `${count(items)} items total`;
}
