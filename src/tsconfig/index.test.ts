/**
 * Unit tests for the TSConfig utilities.
 */

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { LibraryTSConfigFile, NodeEcmaLib, TSConfigFile, TSConfigs, transformStringsDeep } from "./index.js";

describe("transformStringsDeep", () => {
	test("transforms string values", () => {
		const result = transformStringsDeep("hello", (s) => s.toUpperCase());

		expect(result).toBe("HELLO");
	});

	test("handles null", () => {
		const result = transformStringsDeep(null, (s) => s.toUpperCase());

		expect(result).toBeNull();
	});

	test("handles undefined", () => {
		const result = transformStringsDeep(undefined, (s) => s.toUpperCase());

		expect(result).toBeUndefined();
	});

	test("transforms strings in arrays", () => {
		const result = transformStringsDeep(["hello", "world"], (s) => s.toUpperCase());

		expect(result).toEqual(["HELLO", "WORLD"]);
	});

	test("transforms strings in nested arrays", () => {
		const result = transformStringsDeep([["hello"], ["world"]], (s) => s.toUpperCase());

		expect(result).toEqual([["HELLO"], ["WORLD"]]);
	});

	test("transforms strings in objects", () => {
		const result = transformStringsDeep({ greeting: "hello" }, (s) => s.toUpperCase());

		expect(result).toEqual({ greeting: "HELLO" });
	});

	test("transforms strings in nested objects", () => {
		const result = transformStringsDeep({ nested: { greeting: "hello" } }, (s) => s.toUpperCase());

		expect(result).toEqual({ nested: { greeting: "HELLO" } });
	});

	test("handles mixed structures", () => {
		const input = {
			name: "test",
			items: ["one", "two"],
			nested: {
				value: "three",
				list: ["four"],
			},
		};

		const result = transformStringsDeep(input, (s) => s.toUpperCase());

		expect(result).toEqual({
			name: "TEST",
			items: ["ONE", "TWO"],
			nested: {
				value: "THREE",
				list: ["FOUR"],
			},
		});
	});

	test("preserves non-string primitives", () => {
		const input = {
			number: 42,
			boolean: true,
			string: "hello",
		};

		const result = transformStringsDeep(input, (s) => s.toUpperCase());

		expect(result).toEqual({
			number: 42,
			boolean: true,
			string: "HELLO",
		});
	});

	test("replaces template variables", () => {
		const input = {
			// biome-ignore lint/suspicious/noTemplateCurlyInString: testing template replacement
			outDir: "${configDir}/dist",
		};

		// biome-ignore lint/suspicious/noTemplateCurlyInString: testing template replacement
		const result = transformStringsDeep(input, (s) => s.replace("${configDir}", "../.."));

		expect(result).toEqual({
			outDir: "../../dist",
		});
	});
});

describe("TSConfigFile", () => {
	test("creates instance with description and pathname", () => {
		const configFile = new TSConfigFile("Test config", join(import.meta.dirname, "../public/tsconfig/ecma/lib.json"));

		expect(configFile.description).toBe("Test config");
		expect(configFile.pathname).toContain("lib.json");
	});

	test("path getter returns relative path", () => {
		const configFile = new TSConfigFile("Test config", join(import.meta.dirname, "../public/tsconfig/ecma/lib.json"));

		expect(configFile.path).toMatch(/^\.\/.*lib\.json$/);
	});

	test("config getter returns parsed configuration", () => {
		const configFile = new TSConfigFile("Test config", join(import.meta.dirname, "../public/tsconfig/ecma/lib.json"));

		const config = configFile.config;

		expect(config).toHaveProperty("compilerOptions");
		expect(typeof config.compilerOptions).toBe("object");
	});

	test("bundled getter replaces configDir variable", () => {
		const configFile = new TSConfigFile("Test config", join(import.meta.dirname, "../public/tsconfig/ecma/lib.json"));

		const bundled = configFile.bundled;

		// The bundled config should have ${configDir} replaced
		const configString = JSON.stringify(bundled);
		// biome-ignore lint/suspicious/noTemplateCurlyInString: checking that template is NOT in output
		expect(configString).not.toContain("${configDir}");
	});

	test("throws for unknown config path", () => {
		const configFile = new TSConfigFile("Unknown", "/nonexistent/path.json");

		expect(() => configFile.config).toThrow("Config file not found in imports");
	});
});

describe("LibraryTSConfigFile", () => {
	test("extends TSConfigFile", () => {
		expect(NodeEcmaLib).toBeInstanceOf(TSConfigFile);
		expect(NodeEcmaLib).toBeInstanceOf(LibraryTSConfigFile);
	});

	test("bundle method returns transformed config", () => {
		const bundled = NodeEcmaLib.bundle("npm");

		expect(bundled).toHaveProperty("compilerOptions");
		expect(bundled.compilerOptions?.outDir).toBe("dist");
		expect(bundled.compilerOptions?.tsBuildInfoFile).toContain(".tsbuildinfo.npm.bundle");
	});

	test("bundle method filters include patterns", () => {
		const bundled = NodeEcmaLib.bundle("dev");

		// Include should only have src, types, public patterns
		if (bundled.include) {
			for (const pattern of bundled.include) {
				const isValid =
					pattern.includes("/src/") ||
					pattern.includes("/types/") ||
					pattern.includes("/public/") ||
					pattern.includes("package.json");
				expect(isValid).toBe(true);
			}
		}
	});

	test("bundle method includes tsx but excludes cts files", () => {
		const bundled = NodeEcmaLib.bundle("npm");

		if (bundled.include) {
			const hasTsx = bundled.include.some((pattern) => pattern.includes(".tsx"));
			expect(hasTsx).toBe(true);
			for (const pattern of bundled.include) {
				expect(pattern).not.toContain(".cts");
			}
		}
	});

	test("bundle uses different target in tsBuildInfoFile", () => {
		const devBundled = NodeEcmaLib.bundle("dev");
		const npmBundled = NodeEcmaLib.bundle("npm");

		expect(devBundled.compilerOptions?.tsBuildInfoFile).toContain(".dev.bundle");
		expect(npmBundled.compilerOptions?.tsBuildInfoFile).toContain(".npm.bundle");
	});

	test("writeBundleTempConfig creates temp file", () => {
		const tempPath = NodeEcmaLib.writeBundleTempConfig("npm");

		expect(typeof tempPath).toBe("string");
		expect(tempPath).toContain("tsconfig-bundle-");
		expect(tempPath).toContain(".json");

		// File should exist
		const file = Bun.file(tempPath);
		expect(file.size).toBeGreaterThan(0);
	});

	test("writeBundleTempConfig creates valid JSON", async () => {
		const tempPath = NodeEcmaLib.writeBundleTempConfig("dev");

		const content = await Bun.file(tempPath).text();
		const config = JSON.parse(content);

		expect(config).toHaveProperty("compilerOptions");
		expect(config.compilerOptions.rootDir).toBe(process.cwd());
	});
});

describe("TSConfigs", () => {
	test("has node.ecma.lib configuration", () => {
		expect(TSConfigs.node.ecma.lib).toBe(NodeEcmaLib);
	});

	test("NodeEcmaLib has correct description", () => {
		expect(NodeEcmaLib.description).toBe("ECMAScript library build configuration");
	});

	test("NodeEcmaLib points to correct path", () => {
		expect(NodeEcmaLib.pathname).toContain("ecma/lib.json");
	});
});
