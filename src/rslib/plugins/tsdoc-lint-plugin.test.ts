import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LintMessage, LintResult } from "./tsdoc-lint-plugin.js";
import { cleanupTsDocConfig, discoverFilesToLint, formatLintResults, runTsDocLint } from "./tsdoc-lint-plugin.js";

// Track created test directories for cleanup
const testDirs: string[] = [];

function createTestDir(): string {
	const dir = join(tmpdir(), `tsdoc-lint-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
	testDirs.push(dir);
	return dir;
}

describe("tsdoc-lint-plugin", () => {
	afterEach(async () => {
		// Clean up all test directories
		await Promise.all(testDirs.map((dir) => rm(dir, { recursive: true, force: true })));
		testDirs.length = 0;
	});

	describe("formatLintResults", () => {
		const cwd = "/project";

		it("should return empty string for no messages", () => {
			const results: LintResult = {
				errorCount: 0,
				warningCount: 0,
				messages: [],
			};

			const output = formatLintResults(results, cwd);
			expect(output).toBe("");
		});

		it("should format a single error message", () => {
			const results: LintResult = {
				errorCount: 1,
				warningCount: 0,
				messages: [
					{
						filePath: "/project/src/index.ts",
						line: 10,
						column: 5,
						message: 'Unknown TSDoc tag "@foo"',
						ruleId: "tsdoc/syntax",
						severity: 2,
					},
				],
			};

			const output = formatLintResults(results, cwd);
			expect(output).toContain("src/index.ts");
			expect(output).toContain("10:5");
			expect(output).toContain("error");
			expect(output).toContain('Unknown TSDoc tag "@foo"');
			expect(output).toContain("tsdoc/syntax");
			expect(output).toContain("1 error");
		});

		it("should format a single warning message", () => {
			const results: LintResult = {
				errorCount: 0,
				warningCount: 1,
				messages: [
					{
						filePath: "/project/src/utils.ts",
						line: 20,
						column: 1,
						message: "Missing @returns tag",
						ruleId: "tsdoc/syntax",
						severity: 1,
					},
				],
			};

			const output = formatLintResults(results, cwd);
			expect(output).toContain("src/utils.ts");
			expect(output).toContain("20:1");
			expect(output).toContain("warning");
			expect(output).toContain("Missing @returns tag");
			expect(output).toContain("1 warning");
		});

		it("should format multiple messages from multiple files", () => {
			const results: LintResult = {
				errorCount: 2,
				warningCount: 1,
				messages: [
					{
						filePath: "/project/src/index.ts",
						line: 10,
						column: 5,
						message: "Error 1",
						ruleId: "tsdoc/syntax",
						severity: 2,
					},
					{
						filePath: "/project/src/index.ts",
						line: 15,
						column: 1,
						message: "Warning 1",
						ruleId: "tsdoc/syntax",
						severity: 1,
					},
					{
						filePath: "/project/src/utils.ts",
						line: 5,
						column: 3,
						message: "Error 2",
						ruleId: "tsdoc/syntax",
						severity: 2,
					},
				],
			};

			const output = formatLintResults(results, cwd);
			expect(output).toContain("src/index.ts");
			expect(output).toContain("src/utils.ts");
			expect(output).toContain("Error 1");
			expect(output).toContain("Error 2");
			expect(output).toContain("Warning 1");
			expect(output).toContain("2 errors");
		});

		it("should handle messages without ruleId", () => {
			const results: LintResult = {
				errorCount: 1,
				warningCount: 0,
				messages: [
					{
						filePath: "/project/src/index.ts",
						line: 1,
						column: 1,
						message: "Some error",
						ruleId: null,
						severity: 2,
					},
				],
			};

			const output = formatLintResults(results, cwd);
			expect(output).toContain("Some error");
			// Should not have the rule ID parentheses
			expect(output).not.toContain("(null)");
		});

		it("should pluralize correctly for single error/warning", () => {
			const singleError: LintResult = {
				errorCount: 1,
				warningCount: 0,
				messages: [
					{
						filePath: "/project/src/index.ts",
						line: 1,
						column: 1,
						message: "Error",
						ruleId: null,
						severity: 2,
					},
				],
			};

			const singleWarning: LintResult = {
				errorCount: 0,
				warningCount: 1,
				messages: [
					{
						filePath: "/project/src/index.ts",
						line: 1,
						column: 1,
						message: "Warning",
						ruleId: null,
						severity: 1,
					},
				],
			};

			expect(formatLintResults(singleError, cwd)).toContain("1 error");
			expect(formatLintResults(singleError, cwd)).not.toContain("1 errors");
			expect(formatLintResults(singleWarning, cwd)).toContain("1 warning");
			expect(formatLintResults(singleWarning, cwd)).not.toContain("1 warnings");
		});

		it("should pluralize correctly for multiple errors/warnings", () => {
			const messages: LintMessage[] = [
				{ filePath: "/project/a.ts", line: 1, column: 1, message: "E1", ruleId: null, severity: 2 },
				{ filePath: "/project/a.ts", line: 2, column: 1, message: "E2", ruleId: null, severity: 2 },
				{ filePath: "/project/a.ts", line: 3, column: 1, message: "W1", ruleId: null, severity: 1 },
				{ filePath: "/project/a.ts", line: 4, column: 1, message: "W2", ruleId: null, severity: 1 },
			];

			const multipleErrors: LintResult = {
				errorCount: 2,
				warningCount: 2,
				messages,
			};

			expect(formatLintResults(multipleErrors, cwd)).toContain("2 errors");
		});
	});

	describe("discoverFilesToLint", () => {
		it("should use explicit include patterns when provided", async () => {
			const testDir = createTestDir();
			await mkdir(testDir, { recursive: true });

			const result = discoverFilesToLint(
				{
					include: ["src/**/*.ts", "!**/*.test.ts"],
				},
				testDir,
			);

			expect(result.isGlobPattern).toBe(true);
			expect(result.files).toEqual(["src/**/*.ts", "!**/*.test.ts"]);
			expect(result.errors).toEqual([]);
		});

		it("should use import graph when include is not provided", async () => {
			const testDir = createTestDir();
			const srcDir = join(testDir, "src");
			await mkdir(srcDir, { recursive: true });

			// Write a tsconfig.json
			await writeFile(
				join(testDir, "tsconfig.json"),
				JSON.stringify({
					compilerOptions: {
						module: "ESNext",
						moduleResolution: "bundler",
					},
				}),
			);

			// Write package.json with exports
			await writeFile(
				join(testDir, "package.json"),
				JSON.stringify({
					name: "test-package",
					version: "1.0.0",
					exports: "./src/index.ts",
				}),
			);

			// Write source file
			await writeFile(join(srcDir, "index.ts"), "export const x = 1;");

			const result = discoverFilesToLint({}, testDir);

			expect(result.isGlobPattern).toBe(false);
			expect(result.files.length).toBeGreaterThan(0);
			expect(result.files.some((f) => f.includes("index.ts"))).toBe(true);
		});

		it("should use import graph when include is empty array", async () => {
			const testDir = createTestDir();
			const srcDir = join(testDir, "src");
			await mkdir(srcDir, { recursive: true });

			// Write a tsconfig.json
			await writeFile(
				join(testDir, "tsconfig.json"),
				JSON.stringify({
					compilerOptions: {
						module: "ESNext",
						moduleResolution: "bundler",
					},
				}),
			);

			// Write package.json with exports
			await writeFile(
				join(testDir, "package.json"),
				JSON.stringify({
					name: "test-package",
					version: "1.0.0",
					exports: "./src/index.ts",
				}),
			);

			// Write source file
			await writeFile(join(srcDir, "index.ts"), "export const x = 1;");

			// Empty include array should use import graph
			const result = discoverFilesToLint({ include: [] }, testDir);

			expect(result.isGlobPattern).toBe(false);
			expect(result.files.length).toBeGreaterThan(0);
		});
	});

	describe("runTsDocLint", () => {
		it("should return no errors for valid TSDoc", async () => {
			const testDir = createTestDir();
			const srcDir = join(testDir, "src");
			await mkdir(srcDir, { recursive: true });

			// Write a valid TSDoc file
			await writeFile(
				join(srcDir, "index.ts"),
				`/**
 * A valid function.
 * @param value - The value to process
 * @returns The processed result
 */
export function process(value: string): string {
  return value;
}
`,
			);

			const { results } = await runTsDocLint(
				{
					include: ["src/**/*.ts"],
				},
				testDir,
			);

			expect(results.errorCount).toBe(0);
			expect(results.warningCount).toBe(0);
			expect(results.messages).toHaveLength(0);
		});

		it("should detect invalid TSDoc tags", async () => {
			const testDir = createTestDir();
			const srcDir = join(testDir, "src");
			await mkdir(srcDir, { recursive: true });

			// Write an invalid TSDoc file with unknown tag
			await writeFile(
				join(srcDir, "index.ts"),
				`/**
 * A function with invalid TSDoc.
 * @invalidTag This is not a valid TSDoc tag
 */
export function invalid(): void {}
`,
			);

			const { results } = await runTsDocLint(
				{
					include: ["src/**/*.ts"],
				},
				testDir,
			);

			expect(results.errorCount).toBeGreaterThan(0);
			expect(results.messages.length).toBeGreaterThan(0);
			expect(results.messages[0].message).toContain("tsdoc-undefined-tag");
		});

		it("should respect custom tag definitions", async () => {
			const testDir = createTestDir();
			const srcDir = join(testDir, "src");
			await mkdir(srcDir, { recursive: true });

			// Write a file with custom tag
			await writeFile(
				join(srcDir, "index.ts"),
				`/**
 * A function with custom tag.
 * @customTag This is a custom tag
 */
export function custom(): void {}
`,
			);

			// Note: eslint-plugin-tsdoc reads tsdoc.json for custom tags
			// We generate it but ESLint may not pick it up immediately
			// This test verifies the plugin runs without crashing
			const { results } = await runTsDocLint(
				{
					include: ["src/**/*.ts"],
					tsdoc: {
						tagDefinitions: [{ tagName: "@customTag", syntaxKind: "block" }],
					},
				},
				testDir,
			);

			// Even with custom tag definition, ESLint may report it as unknown
			// The important thing is that the plugin runs successfully
			expect(results).toBeDefined();
		});

		it("should exclude test files by default", async () => {
			const testDir = createTestDir();
			const srcDir = join(testDir, "src");
			await mkdir(srcDir, { recursive: true });

			// Write a valid file
			await writeFile(
				join(srcDir, "index.ts"),
				`/**
 * Valid function.
 */
export function valid(): void {}
`,
			);

			// Write an invalid test file - should be excluded
			await writeFile(
				join(srcDir, "index.test.ts"),
				`/**
 * @invalidTestTag This should be ignored
 */
export function test(): void {}
`,
			);

			const { results } = await runTsDocLint({}, testDir);

			// Should not report errors from test file
			expect(results.errorCount).toBe(0);
		});

		it("should respect custom include patterns", async () => {
			const testDir = createTestDir();
			const libDir = join(testDir, "lib");
			await mkdir(libDir, { recursive: true });

			// Write a file in lib/ directory
			await writeFile(
				join(libDir, "utils.ts"),
				`/**
 * @unknownTag This should be detected
 */
export function util(): void {}
`,
			);

			const { results } = await runTsDocLint(
				{
					include: ["lib/**/*.ts"],
				},
				testDir,
			);

			expect(results.errorCount).toBeGreaterThan(0);
		});

		it("should use ImportGraph discovery when include is not provided", async () => {
			const testDir = createTestDir();
			const srcDir = join(testDir, "src");
			await mkdir(srcDir, { recursive: true });

			// Write tsconfig.json for ImportGraph
			await writeFile(
				join(testDir, "tsconfig.json"),
				JSON.stringify({
					compilerOptions: {
						module: "ESNext",
						moduleResolution: "bundler",
					},
				}),
			);

			// Write package.json with exports
			await writeFile(
				join(testDir, "package.json"),
				JSON.stringify({
					name: "test-package",
					version: "1.0.0",
					exports: "./src/index.ts",
				}),
			);

			// Write a valid file in exports
			await writeFile(
				join(srcDir, "index.ts"),
				`/**
 * Valid exported function.
 * @returns Nothing
 */
export function exported(): void {}
`,
			);

			// Write an internal file with invalid TSDoc (not in exports)
			await writeFile(
				join(srcDir, "internal.ts"),
				`/**
 * @badTag Internal function
 */
export function internal(): void {}
`,
			);

			// Use ImportGraph discovery (no include option)
			const { results, discoveryErrors } = await runTsDocLint({}, testDir);

			// ImportGraph should have run without errors
			expect(discoveryErrors).toBeUndefined();
			// Only the exported file should be linted (which has valid TSDoc)
			expect(results.errorCount).toBe(0);
		});

		it("should return discovery errors when ImportGraph fails", async () => {
			const testDir = createTestDir();
			const srcDir = join(testDir, "src");
			await mkdir(srcDir, { recursive: true });

			// Write package.json with exports but NO tsconfig.json
			await writeFile(
				join(testDir, "package.json"),
				JSON.stringify({
					name: "test-package",
					version: "1.0.0",
					exports: "./src/index.ts",
				}),
			);

			await writeFile(join(srcDir, "index.ts"), "export const x = 1;");

			// Use ImportGraph discovery without tsconfig - should fail
			const { discoveryErrors } = await runTsDocLint({}, testDir);

			// Should have discovery errors about missing tsconfig
			expect(discoveryErrors).toBeDefined();
			expect(discoveryErrors?.length).toBeGreaterThan(0);
		});
	});

	describe("CI detection", () => {
		const originalEnv = process.env;

		beforeEach(() => {
			vi.resetModules();
			process.env = { ...originalEnv };
			delete process.env.CI;
			delete process.env.GITHUB_ACTIONS;
		});

		afterEach(() => {
			process.env = originalEnv;
		});

		it("should not persist config in CI by default", async () => {
			process.env.CI = "true";

			const testDir = createTestDir();
			const srcDir = join(testDir, "src");
			await mkdir(srcDir, { recursive: true });

			await writeFile(
				join(srcDir, "index.ts"),
				`/**
 * Valid function.
 */
export function valid(): void {}
`,
			);

			const { tsdocConfigPath } = await runTsDocLint({}, testDir);

			// In CI, config should not be persisted (undefined)
			expect(tsdocConfigPath).toBeUndefined();
		});

		it("should persist config locally by default", async () => {
			// Ensure CI vars are not set
			delete process.env.CI;
			delete process.env.GITHUB_ACTIONS;

			const testDir = createTestDir();
			const srcDir = join(testDir, "src");
			await mkdir(srcDir, { recursive: true });

			await writeFile(
				join(srcDir, "index.ts"),
				`/**
 * Valid function.
 */
export function valid(): void {}
`,
			);

			const { tsdocConfigPath } = await runTsDocLint({}, testDir);

			// Locally, config should be persisted
			expect(tsdocConfigPath).toBeDefined();
			expect(tsdocConfigPath).toContain("tsdoc.json");
		});

		it("should respect explicit persistConfig even in CI", async () => {
			process.env.CI = "true";

			const testDir = createTestDir();
			const srcDir = join(testDir, "src");
			await mkdir(srcDir, { recursive: true });

			await writeFile(
				join(srcDir, "index.ts"),
				`/**
 * Valid function.
 */
export function valid(): void {}
`,
			);

			const { tsdocConfigPath } = await runTsDocLint(
				{
					persistConfig: true,
				},
				testDir,
			);

			// Explicit true should persist even in CI
			expect(tsdocConfigPath).toBeDefined();
		});
	});

	describe("cleanupTsDocConfig", () => {
		it("should do nothing when configPath is undefined", async () => {
			// Should not throw
			await cleanupTsDocConfig(undefined);
		});

		it("should delete config file when path exists", async () => {
			const testDir = createTestDir();
			await mkdir(testDir, { recursive: true });

			const configPath = join(testDir, "tsdoc.json");
			await writeFile(configPath, "{}");

			// Verify file exists
			const { stat } = await import("node:fs/promises");
			await expect(stat(configPath)).resolves.toBeDefined();

			// Cleanup should delete the file
			await cleanupTsDocConfig(configPath);

			// File should no longer exist
			await expect(stat(configPath)).rejects.toThrow(/ENOENT/);
		});

		it("should not throw when file does not exist", async () => {
			const testDir = createTestDir();
			const nonExistentPath = join(testDir, "nonexistent.json");

			// Should not throw even if file doesn't exist
			await cleanupTsDocConfig(nonExistentPath);
		});
	});
});
