import { count } from "./shared.js";

/**
 * Greet a list of names.
 * @param names - Names to greet
 * @returns Greeting with count
 * @public
 */
export function greetAll(names: string[]): string {
	return `Hello to ${count(names)} people!`;
}
