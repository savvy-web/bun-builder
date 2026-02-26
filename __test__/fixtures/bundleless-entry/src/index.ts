/**
 * A simple greeting function.
 *
 * @param name - The name to greet
 * @returns A greeting string
 *
 * @public
 */
export function greet(name: string): string {
	return `Hello, ${name}!`;
}

export { helperFn } from "./utils/helper.js";
