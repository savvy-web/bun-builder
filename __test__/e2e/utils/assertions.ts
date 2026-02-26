/**
 * E2E test assertion helpers.
 */

import { expect } from "bun:test";
import type { BuildFixtureResult } from "./build-fixture.js";
import { readOutputFile, readPackageJson } from "./build-fixture.js";

/** Assert that the build succeeded (exit code 0). */
export function assertBuildSucceeded(result: BuildFixtureResult): void {
	expect(result.exitCode).toBe(0);
}

/** Assert that a specific file exists in the output. */
export function assertOutputExists(result: BuildFixtureResult, filePath: string): void {
	expect(result.outputFiles).toContain(filePath);
}

/** Assert that a specific file does NOT exist in the output. */
export function assertOutputNotExists(result: BuildFixtureResult, filePath: string): void {
	expect(result.outputFiles).not.toContain(filePath);
}

/** Assert that no output file matches a pattern. */
export function assertNoOutputMatching(result: BuildFixtureResult, pattern: RegExp): void {
	const matching = result.outputFiles.filter((f) => pattern.test(f));
	expect(matching).toEqual([]);
}

/** Assert that an output file contains a specific string. */
export function assertOutputContains(result: BuildFixtureResult, filePath: string, text: string): void {
	const content = readOutputFile(result, filePath);
	expect(content).toContain(text);
}

/** Assert that an output file does NOT contain a specific string. */
export function assertOutputNotContains(result: BuildFixtureResult, filePath: string, text: string): void {
	const content = readOutputFile(result, filePath);
	expect(content).not.toContain(text);
}

/** Assert that stdout contains a specific string. */
export function assertStdoutContains(result: BuildFixtureResult, text: string): void {
	expect(result.stdout).toContain(text);
}

/** Assert that the output package.json has a specific field value. */
export function assertPackageJsonField(
	result: BuildFixtureResult,
	field: string,
	expected: unknown,
	dir?: string,
): void {
	const pkg = readPackageJson(result, dir);
	expect(pkg[field]).toEqual(expected);
}
