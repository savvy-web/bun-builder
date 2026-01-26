import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	TsDocConfigBuilder,
	collectDtsFiles,
	ensureTempDeclarationDir,
	findTsConfig,
	generateTsgoArgs,
	getTsgoBinPath,
	getUnscopedPackageName,
	stripSourceMapComment,
} from "./dts-plugin.js";

// Track created test directories for cleanup
const testDirs: string[] = [];

function createTestDir(): string {
	const dir = join(tmpdir(), `dts-plugin-test-${Date.now()}-${Math.random().toString(36).substring(7)}`);
	testDirs.push(dir);
	return dir;
}

describe("dts-plugin utilities", () => {
	// Build sourceMappingURL dynamically to prevent Vite from trying to load non-existent .map files
	const SOURCE_MAP_PREFIX = "//# source" + "MappingURL=";

	afterEach(async () => {
		// Clean up all test directories
		await Promise.all(testDirs.map((dir) => rm(dir, { recursive: true, force: true })));
		testDirs.length = 0;
	});

	describe("stripSourceMapComment", () => {
		it("should strip sourceMappingURL comment from single line", () => {
			const content = `export declare const foo: string;\n${SOURCE_MAP_PREFIX}index.d.ts.map`;
			const result = stripSourceMapComment(content);
			expect(result).toBe("export declare const foo: string;");
		});

		it("should strip sourceMappingURL comment from multiple lines", () => {
			const content = `export declare const foo: string;
${SOURCE_MAP_PREFIX}foo.d.ts.map
export declare const bar: number;
${SOURCE_MAP_PREFIX}bar.d.ts.map`;
			const result = stripSourceMapComment(content);
			expect(result).toBe(`export declare const foo: string;\n\nexport declare const bar: number;`);
		});

		it("should handle content without sourceMappingURL", () => {
			const content = "export declare const foo: string;";
			const result = stripSourceMapComment(content);
			expect(result).toBe("export declare const foo: string;");
		});

		it("should handle empty content", () => {
			const result = stripSourceMapComment("");
			expect(result).toBe("");
		});

		it("should handle only sourceMappingURL comment", () => {
			const content = `${SOURCE_MAP_PREFIX}index.d.ts.map`;
			const result = stripSourceMapComment(content);
			expect(result).toBe("");
		});

		it("should preserve other comments", () => {
			const content = `// This is a regular comment
export declare const foo: string;
/** TSDoc comment */
export declare const bar: number;
${SOURCE_MAP_PREFIX}index.d.ts.map`;
			const result = stripSourceMapComment(content);
			expect(result).toBe(`// This is a regular comment
export declare const foo: string;
/** TSDoc comment */
export declare const bar: number;`);
		});
	});

	describe("getUnscopedPackageName", () => {
		it("should extract name from scoped package", () => {
			expect(getUnscopedPackageName("@scope/package-name")).toBe("package-name");
		});

		it("should return name unchanged for unscoped package", () => {
			expect(getUnscopedPackageName("package-name")).toBe("package-name");
		});

		it("should handle scoped package with nested path", () => {
			expect(getUnscopedPackageName("@my-org/my-package")).toBe("my-package");
		});

		it("should handle empty scope", () => {
			expect(getUnscopedPackageName("@/package")).toBe("package");
		});

		it("should return original if no slash after @", () => {
			expect(getUnscopedPackageName("@no-slash")).toBe("@no-slash");
		});
	});

	describe("generateTsgoArgs", () => {
		it("should generate basic tsgo arguments", () => {
			const args = generateTsgoArgs({
				configPath: "/path/to/tsconfig.json",
				declarationDir: "/path/to/declarations",
			});

			expect(args).toEqual([
				"--project",
				"/path/to/tsconfig.json",
				"--declaration",
				"--emitDeclarationOnly",
				"--declarationMap",
				"--declarationDir",
				"/path/to/declarations",
			]);
		});

		it("should include rootDir when provided", () => {
			const args = generateTsgoArgs({
				configPath: "/path/to/tsconfig.json",
				declarationDir: "/path/to/declarations",
				rootDir: "/path/to/src",
			});

			expect(args).toContain("--rootDir");
			expect(args).toContain("/path/to/src");
		});

		it("should include tsBuildInfoFile when provided", () => {
			const args = generateTsgoArgs({
				configPath: "/path/to/tsconfig.json",
				declarationDir: "/path/to/declarations",
				tsBuildInfoFile: "/path/to/.tsbuildinfo",
			});

			expect(args).toContain("--tsBuildInfoFile");
			expect(args).toContain("/path/to/.tsbuildinfo");
		});

		it("should include both optional arguments when provided", () => {
			const args = generateTsgoArgs({
				configPath: "/path/to/tsconfig.json",
				declarationDir: "/path/to/declarations",
				rootDir: "/path/to/src",
				tsBuildInfoFile: "/path/to/.tsbuildinfo",
			});

			expect(args).toEqual([
				"--project",
				"/path/to/tsconfig.json",
				"--declaration",
				"--emitDeclarationOnly",
				"--declarationMap",
				"--declarationDir",
				"/path/to/declarations",
				"--rootDir",
				"/path/to/src",
				"--tsBuildInfoFile",
				"/path/to/.tsbuildinfo",
			]);
		});
	});

	describe("collectDtsFiles", () => {
		it("should collect .d.ts files from a directory", async () => {
			// Create a temporary directory for testing
			const testDir = createTestDir();
			await mkdir(testDir, { recursive: true });

			// Create some test files
			await writeFile(join(testDir, "index.d.ts"), "export declare const foo: string;");
			await writeFile(join(testDir, "utils.d.ts"), "export declare const bar: number;");
			await writeFile(join(testDir, "index.js"), "export const foo = 'test';");

			const files = await collectDtsFiles(testDir);

			expect(files).toHaveLength(2);
			expect(files.map((f) => f.relativePath).sort()).toEqual(["index.d.ts", "utils.d.ts"]);
		});

		it("should collect .d.ts.map files", async () => {
			const testDir = createTestDir();
			await mkdir(testDir, { recursive: true });

			await writeFile(join(testDir, "index.d.ts"), "export declare const foo: string;");
			await writeFile(join(testDir, "index.d.ts.map"), '{"version":3}');

			const files = await collectDtsFiles(testDir);

			expect(files).toHaveLength(2);
			expect(files.map((f) => f.relativePath).sort()).toEqual(["index.d.ts", "index.d.ts.map"]);
		});

		it("should recursively collect files from subdirectories", async () => {
			const testDir = createTestDir();
			const subDir = join(testDir, "utils");
			await mkdir(subDir, { recursive: true });

			await writeFile(join(testDir, "index.d.ts"), "export declare const foo: string;");
			await writeFile(join(subDir, "helpers.d.ts"), "export declare const bar: number;");

			const files = await collectDtsFiles(testDir);

			expect(files).toHaveLength(2);
			const relativePaths = files.map((f) => f.relativePath).sort();
			expect(relativePaths).toEqual(["index.d.ts", "utils/helpers.d.ts"]);
		});

		it("should return empty array for directory with no .d.ts files", async () => {
			const testDir = createTestDir();
			await mkdir(testDir, { recursive: true });

			await writeFile(join(testDir, "index.js"), "export const foo = 'test';");
			await writeFile(join(testDir, "index.ts"), "export const foo: string = 'test';");

			const files = await collectDtsFiles(testDir);

			expect(files).toHaveLength(0);
		});

		it("should handle deeply nested directory structures", async () => {
			const testDir = createTestDir();
			const deepDir = join(testDir, "a", "b", "c");
			await mkdir(deepDir, { recursive: true });

			await writeFile(join(testDir, "root.d.ts"), "export declare const root: string;");
			await writeFile(join(deepDir, "deep.d.ts"), "export declare const deep: string;");

			const files = await collectDtsFiles(testDir);

			expect(files).toHaveLength(2);
			const relativePaths = files.map((f) => f.relativePath).sort();
			expect(relativePaths).toEqual(["a/b/c/deep.d.ts", "root.d.ts"]);
		});

		it("should return full path for each file", async () => {
			const testDir = createTestDir();
			await mkdir(testDir, { recursive: true });

			await writeFile(join(testDir, "index.d.ts"), "export declare const foo: string;");

			const files = await collectDtsFiles(testDir);

			expect(files).toHaveLength(1);
			expect(files[0].path).toBe(join(testDir, "index.d.ts"));
			expect(files[0].relativePath).toBe("index.d.ts");
		});

		it("should use custom baseDir for relative paths", async () => {
			const testDir = createTestDir();
			const subDir = join(testDir, "dist");
			await mkdir(subDir, { recursive: true });

			await writeFile(join(subDir, "index.d.ts"), "export declare const foo: string;");

			// Use testDir as baseDir but scan subDir
			const files = await collectDtsFiles(subDir, testDir);

			expect(files).toHaveLength(1);
			expect(files[0].relativePath).toBe("dist/index.d.ts");
		});
	});

	describe("getTsgoBinPath", () => {
		const originalCwd = process.cwd();

		beforeEach(() => {
			vi.clearAllMocks();
		});

		afterEach(() => {
			process.chdir(originalCwd);
		});

		it("should return local tsgo path when file doesn't exist", async () => {
			const testDir = createTestDir();
			await mkdir(testDir, { recursive: true });
			process.chdir(testDir);

			const binPath = getTsgoBinPath();
			expect(binPath).toMatch(/node_modules\/\.bin\/tsgo$/);
		});

		it("should return local tsgo path when it exists", async () => {
			const testDir = createTestDir();
			const binDir = join(testDir, "node_modules", ".bin");
			await mkdir(binDir, { recursive: true });
			const tsgoBinPath = join(binDir, "tsgo");
			await writeFile(tsgoBinPath, "#!/usr/bin/env node");

			process.chdir(testDir);

			const binPath = getTsgoBinPath();
			expect(binPath).toMatch(/node_modules\/\.bin\/tsgo$/);
			expect(existsSync(binPath)).toBe(true);
		});

		it("should find tsgo in workspace root when not in local node_modules", async () => {
			// This test verifies the workspace root fallback by running from the actual project
			// where tsgo exists in the workspace root's node_modules
			const binPath = getTsgoBinPath();
			// Should find tsgo somewhere in the path
			expect(binPath).toMatch(/node_modules\/\.bin\/tsgo$/);
			// The actual tsgo should exist since we're in the real project
			expect(existsSync(binPath)).toBe(true);
		});
	});

	describe("ensureTempDeclarationDir", () => {
		it("should create temp declaration directory", async () => {
			const testDir = createTestDir();
			const name = "test-env";

			const dir = await ensureTempDeclarationDir(testDir, name);

			expect(dir).toBe(join(testDir, ".rslib", "declarations", name));
			expect(existsSync(dir)).toBe(true);
		});

		it("should clean existing directory before creating", async () => {
			const testDir = createTestDir();
			const name = "test-env";
			const dir = join(testDir, ".rslib", "declarations", name);

			await mkdir(dir, { recursive: true });
			await writeFile(join(dir, "old-file.d.ts"), "old content");

			const result = await ensureTempDeclarationDir(testDir, name);

			expect(result).toBe(dir);
			expect(existsSync(join(dir, "old-file.d.ts"))).toBe(false);
		});
	});

	describe("findTsConfig", () => {
		it("should return null when no config file exists", () => {
			const testDir = createTestDir();
			const result = findTsConfig(testDir);
			expect(result).toBe(null);
		});

		it("should find absolute path when provided and file exists", async () => {
			const testDir = createTestDir();
			await mkdir(testDir, { recursive: true });
			const configPath = join(testDir, "tsconfig.json");
			await writeFile(configPath, "{}");

			const result = findTsConfig(testDir, configPath);
			expect(result).toBe(configPath);
		});
	});

	describe("TsDocConfigBuilder.build", () => {
		it("should use standard tags when all groups enabled (default)", () => {
			const result = TsDocConfigBuilder.build({});

			// When all groups enabled, useStandardTags is true (noStandardTags: false)
			expect(result.useStandardTags).toBe(true);
			// No tag definitions needed - TSDoc loads them automatically
			expect(result.tagDefinitions).toHaveLength(0);
			// supportForTags must be populated (API Extractor requires explicit support)
			expect(Object.keys(result.supportForTags).length).toBeGreaterThan(0);
			expect(result.supportForTags["@param"]).toBe(true);
			expect(result.supportForTags["@public"]).toBe(true);
		});

		it("should explicitly define tags when subset of groups specified", () => {
			const result = TsDocConfigBuilder.build({ groups: ["core"] });

			// When subset, useStandardTags is false (noStandardTags: true)
			expect(result.useStandardTags).toBe(false);
			// Core tags should be present
			expect(result.tagDefinitions).toContainEqual(expect.objectContaining({ tagName: "@param" }));
			// Extended tags should NOT be present (e.g., @example is extended in official TSDoc)
			expect(result.tagDefinitions).not.toContainEqual(expect.objectContaining({ tagName: "@example" }));
			// Discretionary tags should NOT be present (release stages like @public, @beta)
			expect(result.tagDefinitions).not.toContainEqual(expect.objectContaining({ tagName: "@public" }));
		});

		it("should add custom tag definitions with all groups", () => {
			const result = TsDocConfigBuilder.build({
				tagDefinitions: [{ tagName: "@error", syntaxKind: "inline" }],
			});

			// Still uses standard tags (all groups enabled)
			expect(result.useStandardTags).toBe(true);
			// Only custom tag is in tagDefinitions
			expect(result.tagDefinitions).toHaveLength(1);
			expect(result.tagDefinitions).toContainEqual(
				expect.objectContaining({ tagName: "@error", syntaxKind: "inline" }),
			);
			// Custom tag should be in supportForTags
			expect(result.supportForTags["@error"]).toBe(true);
		});

		it("should auto-derive supportForTags from tag definitions", () => {
			const result = TsDocConfigBuilder.build({
				groups: ["core"],
				tagDefinitions: [{ tagName: "@error", syntaxKind: "inline" }],
			});

			// Core tags should be supported (from explicit definitions)
			expect(result.supportForTags["@param"]).toBe(true);
			// Custom tags should be supported
			expect(result.supportForTags["@error"]).toBe(true);
			// Extended tags should NOT be in supportForTags (not in enabled groups)
			expect(result.supportForTags["@example"]).toBeUndefined();
		});

		it("should allow disabling tags via supportForTags override", () => {
			const result = TsDocConfigBuilder.build({
				groups: ["core", "extended", "discretionary"],
				supportForTags: { "@beta": false },
			});

			// @beta should be disabled even with all groups
			expect(result.supportForTags["@beta"]).toBe(false);
		});

		it("should combine groups and custom tags correctly", () => {
			const result = TsDocConfigBuilder.build({
				groups: ["core"],
				tagDefinitions: [{ tagName: "@custom", syntaxKind: "block" }],
				supportForTags: { "@deprecated": false },
			});

			// Subset of groups, so useStandardTags is false
			expect(result.useStandardTags).toBe(false);

			// Only core tags + custom tag
			const tagNames = result.tagDefinitions.map((t) => t.tagName);
			expect(tagNames).toContain("@param");
			expect(tagNames).toContain("@custom");
			expect(tagNames).not.toContain("@public"); // discretionary

			// supportForTags
			expect(result.supportForTags["@param"]).toBe(true);
			expect(result.supportForTags["@custom"]).toBe(true);
			expect(result.supportForTags["@deprecated"]).toBe(false); // overridden
		});

		it("should use standard tags when all groups explicitly specified", () => {
			const result = TsDocConfigBuilder.build({
				groups: ["core", "extended", "discretionary"],
			});

			// All groups = use standard tags
			expect(result.useStandardTags).toBe(true);
			expect(result.tagDefinitions).toHaveLength(0);
			// supportForTags must still be populated
			expect(Object.keys(result.supportForTags).length).toBeGreaterThan(0);
		});
	});

	describe("TsDocConfigBuilder.writeConfigFile", () => {
		it("should generate config with supportForTags when all groups enabled", async () => {
			const testDir = createTestDir();
			await mkdir(testDir, { recursive: true });

			const configPath = await TsDocConfigBuilder.writeConfigFile({}, testDir);
			const content = JSON.parse(await readFile(configPath, "utf-8"));

			// All groups = noStandardTags: false (TSDoc loads standard tag definitions)
			expect(content.noStandardTags).toBe(false);
			// No tagDefinitions needed - TSDoc loads them automatically
			expect(content.tagDefinitions).toBeUndefined();
			// supportForTags must be populated (API Extractor requires explicit support)
			expect(content.supportForTags).toBeDefined();
			expect(content.supportForTags["@param"]).toBe(true);
			expect(content.supportForTags["@public"]).toBe(true);
		});

		it("should generate full config when subset of groups specified", async () => {
			const testDir = createTestDir();
			await mkdir(testDir, { recursive: true });

			const configPath = await TsDocConfigBuilder.writeConfigFile({ groups: ["core"] }, testDir);
			const content = JSON.parse(await readFile(configPath, "utf-8"));

			// Subset = noStandardTags: true (explicit tags)
			expect(content.noStandardTags).toBe(true);
			// tagDefinitions should contain core tags
			expect(content.tagDefinitions).toBeDefined();
			expect(content.tagDefinitions.some((t: { tagName: string }) => t.tagName === "@param")).toBe(true);
			// supportForTags should be defined
			expect(content.supportForTags).toBeDefined();
			expect(content.supportForTags["@param"]).toBe(true);
		});

		it("should include custom tags in minimal config", async () => {
			const testDir = createTestDir();
			await mkdir(testDir, { recursive: true });

			const configPath = await TsDocConfigBuilder.writeConfigFile(
				{
					tagDefinitions: [{ tagName: "@error", syntaxKind: "inline" }],
				},
				testDir,
			);
			const content = JSON.parse(await readFile(configPath, "utf-8"));

			// All groups = noStandardTags: false
			expect(content.noStandardTags).toBe(false);
			// Only custom tag in tagDefinitions
			expect(content.tagDefinitions).toHaveLength(1);
			expect(content.tagDefinitions[0].tagName).toBe("@error");
			// Only custom tag in supportForTags
			expect(content.supportForTags["@error"]).toBe(true);
		});

		it("should format with tabs and trailing newline", async () => {
			const testDir = createTestDir();
			await mkdir(testDir, { recursive: true });

			const configPath = await TsDocConfigBuilder.writeConfigFile({}, testDir);
			const rawContent = await readFile(configPath, "utf-8");

			// Should use tabs for indentation
			expect(rawContent).toContain("\t");
			expect(rawContent).not.toMatch(/^ {2}/m); // No 2-space indentation
			// Should have trailing newline
			expect(rawContent.endsWith("\n")).toBe(true);
		});

		it("should not rewrite file if content is identical", async () => {
			const testDir = createTestDir();
			await mkdir(testDir, { recursive: true });

			// Write initial file
			const configPath = await TsDocConfigBuilder.writeConfigFile({}, testDir);
			const initialContent = await readFile(configPath, "utf-8");

			// Get file stats before second write
			const { stat } = await import("node:fs/promises");
			const statsBefore = await stat(configPath);

			// Small delay to ensure mtime would change if file is rewritten
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Write again with same options
			await TsDocConfigBuilder.writeConfigFile({}, testDir);
			const statsAfter = await stat(configPath);

			// Content should be identical
			const finalContent = await readFile(configPath, "utf-8");
			expect(finalContent).toBe(initialContent);

			// File should not have been modified (mtime unchanged)
			expect(statsAfter.mtimeMs).toBe(statsBefore.mtimeMs);
		});

		it("should rewrite file if content differs", async () => {
			const testDir = createTestDir();
			await mkdir(testDir, { recursive: true });

			// Write initial file with all groups
			await TsDocConfigBuilder.writeConfigFile({}, testDir);
			const configPath = join(testDir, "tsdoc.json");

			// Get file stats before second write
			const { stat } = await import("node:fs/promises");
			const statsBefore = await stat(configPath);

			// Small delay to ensure mtime would change if file is rewritten
			await new Promise((resolve) => setTimeout(resolve, 10));

			// Write again with different options (subset of groups)
			await TsDocConfigBuilder.writeConfigFile({ groups: ["core"] }, testDir);
			const statsAfter = await stat(configPath);

			// File should have been modified (mtime changed)
			expect(statsAfter.mtimeMs).toBeGreaterThan(statsBefore.mtimeMs);

			// Content should now have noStandardTags: true
			const content = JSON.parse(await readFile(configPath, "utf-8"));
			expect(content.noStandardTags).toBe(true);
		});
	});

	describe("TsDocConfigBuilder.TAG_GROUPS", () => {
		it("should have core group with essential tags (from @microsoft/tsdoc)", () => {
			const coreTagNames = TsDocConfigBuilder.TAG_GROUPS.core.map((t) => t.tagName);
			// Core tags per official TSDoc spec
			expect(coreTagNames).toContain("@param");
			expect(coreTagNames).toContain("@returns");
			expect(coreTagNames).toContain("@remarks");
			expect(coreTagNames).toContain("@deprecated");
			expect(coreTagNames).toContain("@privateRemarks");
			// @example is NOT core - it's extended in official TSDoc
			expect(coreTagNames).not.toContain("@example");
		});

		it("should have extended group with API Extractor tags (from @microsoft/tsdoc)", () => {
			const extendedTagNames = TsDocConfigBuilder.TAG_GROUPS.extended.map((t) => t.tagName);
			// Extended tags per official TSDoc spec
			expect(extendedTagNames).toContain("@example");
			expect(extendedTagNames).toContain("@defaultValue");
			expect(extendedTagNames).toContain("@throws");
			expect(extendedTagNames).toContain("@see");
			expect(extendedTagNames).toContain("@virtual");
			expect(extendedTagNames).toContain("@override");
			// Release stage tags are NOT extended - they're discretionary
			expect(extendedTagNames).not.toContain("@public");
		});

		it("should have discretionary group with release stage tags (from @microsoft/tsdoc)", () => {
			const discretionaryTagNames = TsDocConfigBuilder.TAG_GROUPS.discretionary.map((t) => t.tagName);
			// Discretionary tags are release stage indicators in official TSDoc
			expect(discretionaryTagNames).toContain("@alpha");
			expect(discretionaryTagNames).toContain("@beta");
			expect(discretionaryTagNames).toContain("@public");
			expect(discretionaryTagNames).toContain("@internal");
			expect(discretionaryTagNames).toContain("@experimental");
		});
	});

	describe("TsDocConfigBuilder.isCI", () => {
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

		it("should return false when no CI env vars are set", () => {
			expect(TsDocConfigBuilder.isCI()).toBe(false);
		});

		it("should return true when CI=true", () => {
			process.env.CI = "true";
			expect(TsDocConfigBuilder.isCI()).toBe(true);
		});

		it("should return true when GITHUB_ACTIONS=true", () => {
			process.env.GITHUB_ACTIONS = "true";
			expect(TsDocConfigBuilder.isCI()).toBe(true);
		});

		it("should return false when CI=false", () => {
			process.env.CI = "false";
			expect(TsDocConfigBuilder.isCI()).toBe(false);
		});

		it("should return false when CI is set to non-true value", () => {
			process.env.CI = "1";
			expect(TsDocConfigBuilder.isCI()).toBe(false);
		});
	});

	describe("TsDocConfigBuilder.shouldPersist", () => {
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

		it("should return false when persistConfig is false", () => {
			expect(TsDocConfigBuilder.shouldPersist(false)).toBe(false);
		});

		it("should return true when persistConfig is true", () => {
			expect(TsDocConfigBuilder.shouldPersist(true)).toBe(true);
		});

		it("should return true when persistConfig is a string path", () => {
			expect(TsDocConfigBuilder.shouldPersist("./config/tsdoc.json")).toBe(true);
		});

		it("should return true when undefined and not in CI", () => {
			expect(TsDocConfigBuilder.shouldPersist(undefined)).toBe(true);
		});

		it("should return false when undefined and CI=true", () => {
			process.env.CI = "true";
			expect(TsDocConfigBuilder.shouldPersist(undefined)).toBe(false);
		});

		it("should return false when undefined and GITHUB_ACTIONS=true", () => {
			process.env.GITHUB_ACTIONS = "true";
			expect(TsDocConfigBuilder.shouldPersist(undefined)).toBe(false);
		});

		it("should return true when true even in CI", () => {
			process.env.CI = "true";
			expect(TsDocConfigBuilder.shouldPersist(true)).toBe(true);
		});
	});

	describe("TsDocConfigBuilder.getConfigPath", () => {
		it("should return project root path when persistConfig is true", () => {
			const result = TsDocConfigBuilder.getConfigPath(true, "/project");
			expect(result).toBe("/project/tsdoc.json");
		});

		it("should return project root path when persistConfig is undefined", () => {
			const result = TsDocConfigBuilder.getConfigPath(undefined, "/project");
			expect(result).toBe("/project/tsdoc.json");
		});

		it("should return custom path when relative string provided", () => {
			const result = TsDocConfigBuilder.getConfigPath("./config/tsdoc.json", "/project");
			expect(result).toBe("/project/config/tsdoc.json");
		});

		it("should return custom path when string without ./ provided", () => {
			const result = TsDocConfigBuilder.getConfigPath("config/tsdoc.json", "/project");
			expect(result).toBe("/project/config/tsdoc.json");
		});

		it("should return absolute path unchanged", () => {
			const result = TsDocConfigBuilder.getConfigPath("/absolute/path/tsdoc.json", "/project");
			expect(result).toBe("/absolute/path/tsdoc.json");
		});

		it("should handle URL objects", () => {
			const url = new URL("file:///custom/path/tsdoc.json");
			const result = TsDocConfigBuilder.getConfigPath(url, "/project");
			expect(result).toContain("tsdoc.json");
		});

		it("should handle Buffer objects", () => {
			const buffer = Buffer.from("custom/tsdoc.json");
			const result = TsDocConfigBuilder.getConfigPath(buffer, "/project");
			expect(result).toBe("/project/custom/tsdoc.json");
		});
	});
});
