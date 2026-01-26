import { describe, expect, it } from "vitest";
import type { FlexibleExports } from "./package-json-transformer.js";
import { isConditionsObject, transformPackageExports } from "./package-json-transformer.js";

// Helper functions for backwards compatibility with the test structure
// These are now internal to package-json-transformer.ts but we test through the public API
function transformStringExport(
	exportString: string,
	processTSExports: boolean,
	exportKey?: string,
	entrypoints?: Map<string, string>,
	exportToOutputMap?: Map<string, string>,
	collapseIndex: boolean = false,
): FlexibleExports {
	return transformPackageExports(
		exportString,
		processTSExports,
		exportKey,
		entrypoints,
		exportToOutputMap,
		collapseIndex,
	);
}

function transformArrayExports(
	exports: FlexibleExports[],
	processTSExports: boolean,
	exportKey?: string,
	entrypoints?: Map<string, string>,
	exportToOutputMap?: Map<string, string>,
	collapseIndex: boolean = false,
): FlexibleExports[] {
	return transformPackageExports(
		exports,
		processTSExports,
		exportKey,
		entrypoints,
		exportToOutputMap,
		collapseIndex,
	) as FlexibleExports[];
}

function transformObjectExports(
	exports: Record<string, unknown>,
	processTSExports: boolean,
	exportKey?: string,
	entrypoints?: Map<string, string>,
	exportToOutputMap?: Map<string, string>,
	collapseIndex: boolean = false,
): Record<string, unknown> {
	return transformPackageExports(
		exports as FlexibleExports,
		processTSExports,
		exportKey,
		entrypoints,
		exportToOutputMap,
		collapseIndex,
	) as Record<string, unknown>;
}

function transformExportEntry(
	key: string,
	value: unknown,
	isConditions: boolean,
	processTSExports: boolean,
	exportKey?: string,
	entrypoints?: Map<string, string>,
	exportToOutputMap?: Map<string, string>,
	collapseIndex: boolean = false,
): unknown {
	// For testing purposes, we wrap the value in an object and extract the result
	if (isConditions) {
		const obj = { [key]: value };
		const result = transformPackageExports(
			obj as FlexibleExports,
			processTSExports,
			exportKey,
			entrypoints,
			exportToOutputMap,
			collapseIndex,
		) as Record<string, unknown>;
		return result[key];
	}
	return transformPackageExports(
		value as FlexibleExports,
		processTSExports,
		key,
		entrypoints,
		exportToOutputMap,
		collapseIndex,
	);
}

describe("export-transform-utils", () => {
	describe("isConditionsObject", () => {
		it("should return true for export conditions", () => {
			expect(
				isConditionsObject({
					import: "./index.js",
					require: "./index.cjs",
					types: "./index.d.ts",
				}),
			).toBe(true);
		});

		it("should return false for subpath exports", () => {
			expect(
				isConditionsObject({
					"./utils": "./src/utils.js",
					"./helpers": "./src/helpers.js",
				}),
			).toBe(false);
		});

		it("should return true if any condition key is present", () => {
			expect(
				isConditionsObject({
					import: "./index.js",
					"./utils": "./utils.js",
				}),
			).toBe(true);
		});

		it("should return false for empty object", () => {
			expect(isConditionsObject({})).toBe(false);
		});
	});

	describe("transformStringExport", () => {
		it("should transform TypeScript files to export conditions", () => {
			const result = transformStringExport("./src/index.ts", true);
			expect(result).toEqual({
				types: "./index.d.ts",
				import: "./index.js",
			});
		});

		it("should transform TypeScript files normally regardless of export key", () => {
			const result = transformStringExport("./src/schema.ts", true, "./schema.json");
			expect(result).toEqual({
				types: "./schema.d.ts",
				import: "./schema.js",
			});
		});

		it("should transform JavaScript files without types", () => {
			const result = transformStringExport("./src/utils.js", true);
			expect(result).toBe("./utils.js");
		});

		it("should not transform when processTSExports is false", () => {
			const result = transformStringExport("./src/index.ts", false);
			expect(result).toBe("./index.ts");
		});

		it("should handle .d.ts files without adding types field", () => {
			const result = transformStringExport("./src/types.d.ts", true);
			expect(result).toBe("./types.d.ts");
		});

		it("should handle .tsx files", () => {
			const result = transformStringExport("./src/Component.tsx", true);
			expect(result).toEqual({
				types: "./Component.d.ts",
				import: "./Component.js",
			});
		});
	});

	describe("transformArrayExports", () => {
		it("should transform array exports recursively", () => {
			const result = transformArrayExports(["./src/modern.ts", "./src/fallback.js"], true);
			expect(result).toEqual([{ types: "./modern.d.ts", import: "./modern.js" }, "./fallback.js"]);
		});

		it("should handle nested array exports", () => {
			const result = transformArrayExports([["./src/nested.ts", "./src/fallback.js"], "./src/main.ts"], true);
			expect(result).toEqual([
				[{ types: "./nested.d.ts", import: "./nested.js" }, "./fallback.js"],
				{ types: "./main.d.ts", import: "./main.js" },
			]);
		});

		it("should handle empty arrays", () => {
			const result = transformArrayExports([], true);
			expect(result).toEqual([]);
		});
	});

	describe("transformExportEntry", () => {
		it("should transform condition values when isConditions is true", () => {
			const result = transformExportEntry("import", "./src/index.ts", true, true);
			expect(result).toBe("./index.js");
		});

		it("should recursively transform when isConditions is false", () => {
			const result = transformExportEntry("./utils", "./src/utils.ts", false, true, "subpath");
			expect(result).toEqual({
				types: "./utils.d.ts",
				import: "./utils.js",
			});
		});

		it("should preserve null/undefined values", () => {
			expect(transformExportEntry("import", null, true, true)).toBeNull();
			expect(transformExportEntry("import", undefined, true, true)).toBeUndefined();
		});

		it("should handle non-string condition values (objects) when isConditions is true", () => {
			const nestedExport = {
				import: "./nested/index.ts",
				require: "./nested/index.cjs",
			};
			const result = transformExportEntry("import", nestedExport, true, true);
			expect(result).toEqual({
				import: "./nested/index.js",
				require: "./nested/index.cjs",
			});
		});

		it("should handle non-string condition values (arrays) when isConditions is true", () => {
			const arrayExport = ["./src/modern.ts", "./src/fallback.js"];
			const result = transformExportEntry("require", arrayExport, true, true);
			expect(result).toEqual([{ types: "./modern.d.ts", import: "./modern.js" }, "./fallback.js"]);
		});

		it("should recursively transform non-string condition values for condition keys", () => {
			// This targets line 174: transformPackageExports for condition keys with object values
			const complexConditionValue = {
				"./nested": "./src/nested.ts",
			};
			const result = transformExportEntry("types", complexConditionValue, true, true, "./main");
			expect(result).toEqual({
				"./nested": { types: "./nested.d.ts", import: "./nested.js" },
			});
		});

		it("should handle null/undefined values for subpath exports when isConditions is false", () => {
			expect(transformExportEntry("./nullPath", null, false, true)).toBeNull();
			expect(transformExportEntry("./undefinedPath", undefined, false, true)).toBeUndefined();
		});

		it("should handle complex nested condition values", () => {
			const complexExport = {
				node: {
					import: "./src/node.ts",
					require: "./src/node.cjs",
				},
				browser: "./src/browser.ts",
			};
			const result = transformExportEntry("default", complexExport, true, true);
			expect(result).toEqual({
				node: {
					import: "./node.js",
					require: "./node.cjs",
				},
				browser: { types: "./browser.d.ts", import: "./browser.js" },
			});
		});

		it("should handle non-condition keys in condition context", () => {
			// This tests the else branch for non-condition keys
			const result = transformExportEntry("node", "./src/node.ts", true, true);
			expect(result).toEqual({
				types: "./node.d.ts",
				import: "./node.js",
			});
		});
	});

	describe("transformObjectExports", () => {
		it("should transform export conditions", () => {
			const result = transformObjectExports(
				{
					import: "./src/index.ts",
					require: "./src/index.cjs",
					types: "./src/index.d.ts",
				},
				true,
			);
			expect(result).toEqual({
				import: "./index.js",
				require: "./index.cjs",
				types: "./index.d.ts",
			});
		});

		it("should transform subpath exports", () => {
			const result = transformObjectExports(
				{
					"./utils": "./src/utils.ts",
					"./helpers": "./src/helpers.ts",
				},
				true,
			);
			expect(result).toEqual({
				"./utils": { types: "./utils.d.ts", import: "./utils.js" },
				"./helpers": { types: "./helpers.d.ts", import: "./helpers.js" },
			});
		});
	});

	describe("transformPackageExports", () => {
		it("should handle string exports", () => {
			const result = transformPackageExports("./src/index.ts", true);
			expect(result).toEqual({
				types: "./index.d.ts",
				import: "./index.js",
			});
		});

		it("should handle array exports", () => {
			const result = transformPackageExports(["./src/modern.ts", "./src/fallback.js"], true);
			expect(result).toEqual([{ types: "./modern.d.ts", import: "./modern.js" }, "./fallback.js"]);
		});

		it("should handle object exports", () => {
			const result = transformPackageExports(
				{
					import: "./src/index.ts",
					require: "./src/index.cjs",
				},
				true,
			);
			expect(result).toEqual({
				import: "./index.js",
				require: "./index.cjs",
			});
		});

		it("should handle conditional exports with null/undefined values", () => {
			const result = transformPackageExports(
				{
					import: "./src/index.ts",
					require: null,
					types: undefined,
					default: "./src/fallback.js",
				},
				true,
			);
			expect(result).toEqual({
				import: "./index.js",
				require: null,
				types: undefined,
				default: "./fallback.js",
			});
		});

		it("should handle null/undefined exports", () => {
			expect(transformPackageExports(null, true)).toBeNull();
			expect(transformPackageExports(undefined, true)).toBeUndefined();
		});

		it("should not transform when processTSExports is false", () => {
			const result = transformPackageExports("./src/index.ts", false);
			expect(result).toBe("./index.ts");
		});

		it("should handle deeply nested export structures", () => {
			const deeplyNested = {
				"./feature": {
					node: {
						import: ["./src/feature/node.ts", "./src/feature/fallback.js"],
						require: "./src/feature/node.cjs",
					},
					browser: {
						development: "./src/feature/browser.dev.ts",
						production: "./src/feature/browser.prod.ts",
					},
					default: "./src/feature/index.ts",
				},
			};
			const result = transformPackageExports(deeplyNested, true);
			expect(result).toEqual({
				"./feature": {
					node: {
						import: [{ types: "./feature/node.d.ts", import: "./feature/node.js" }, "./feature/fallback.js"],
						require: "./feature/node.cjs",
					},
					browser: {
						development: { types: "./feature/browser.dev.d.ts", import: "./feature/browser.dev.js" },
						production: { types: "./feature/browser.prod.d.ts", import: "./feature/browser.prod.js" },
					},
					default: "./feature/index.js",
				},
			});
		});

		it("should use default processTSExports value when not specified", () => {
			// Testing the default parameter value (true)
			const result = transformPackageExports("./src/index.ts");
			expect(result).toEqual({
				types: "./index.d.ts",
				import: "./index.js",
			});
		});

		it("should handle mixed condition and subpath exports correctly", () => {
			const mixedExports = {
				".": {
					import: "./src/index.ts",
					require: "./src/index.cjs",
				},
				"./utils": "./src/utils.ts",
				"./types": {
					types: "./src/types.d.ts",
					default: "./src/types.js",
				},
			};
			const result = transformPackageExports(mixedExports, true);
			expect(result).toEqual({
				".": {
					import: "./index.js",
					require: "./index.cjs",
				},
				"./utils": { types: "./utils.d.ts", import: "./utils.js" },
				"./types": {
					types: "./types.d.ts",
					default: "./types.js",
				},
			});
		});

		it("should handle boolean and number values gracefully", () => {
			// Edge case: non-standard export values
			const result = transformPackageExports(true as unknown as FlexibleExports, true);
			expect(result).toBe(true);

			const result2 = transformPackageExports(42 as unknown as FlexibleExports, true);
			expect(result2).toBe(42);
		});
	});

	describe("edge cases and complex scenarios", () => {
		it("should handle circular-like structures in exports", () => {
			const exports = {
				"./a": {
					import: "./src/a.ts",
					require: {
						node: "./src/a.node.ts",
						default: "./src/a.default.ts",
					},
				},
			};
			const result = transformPackageExports(exports, true);
			expect(result).toEqual({
				"./a": {
					import: "./a.js",
					require: {
						node: { types: "./a.node.d.ts", import: "./a.node.js" },
						default: "./a.default.js",
					},
				},
			});
		});

		it("should handle exports with all condition types", () => {
			const exports = {
				import: "./esm/index.ts",
				require: "./cjs/index.cjs",
				types: "./types/index.d.ts",
				default: "./fallback.ts",
				node: "./node/index.ts",
				browser: "./browser/index.ts",
				development: "./dev/index.ts",
				production: "./prod/index.ts",
			};
			const result = transformPackageExports(exports, true);
			expect(result).toEqual({
				import: "./esm/index.js",
				require: "./cjs/index.cjs",
				types: "./types/index.d.ts",
				default: "./fallback.js",
				node: { types: "./node/index.d.ts", import: "./node/index.js" },
				browser: { types: "./browser/index.d.ts", import: "./browser/index.js" },
				development: { types: "./dev/index.d.ts", import: "./dev/index.js" },
				production: { types: "./prod/index.d.ts", import: "./prod/index.js" },
			});
		});

		it("should handle empty strings in exports", () => {
			const result = transformPackageExports("", true);
			expect(result).toBe("");
		});

		it("should handle exports with only null/undefined values", () => {
			const exports = {
				import: null,
				require: undefined,
				types: null,
				default: undefined,
			};
			const result = transformPackageExports(exports, true);
			expect(result).toEqual({
				import: null,
				require: undefined,
				types: null,
				default: undefined,
			});
		});
	});

	describe("transformStringExport with entrypoints", () => {
		it("should use entrypoints map when available for exact key match (JS files)", () => {
			const entrypoints = new Map([["./utils.js", "./dist/utils.js"]]);

			const result = transformStringExport("./src/utils.js", true, "./utils.js", entrypoints);
			expect(result).toBe("./dist/utils.js");
		});

		it("should use entrypoints map for key without ./ prefix (JS files)", () => {
			const entrypoints = new Map([["utils.js", "./dist/utils.js"]]);

			const result = transformStringExport("./src/utils.js", true, "./utils.js", entrypoints);
			expect(result).toBe("./dist/utils.js");
		});

		it("should use entrypoints map for TypeScript files and create conditions", () => {
			const entrypoints = new Map([["./schema.json", "./generated/schema.json"]]);

			const result = transformStringExport("./src/schema.ts", true, "./schema.json", entrypoints);
			expect(result).toEqual({
				types: "./generated/schema.json.d.ts",
				import: "./generated/schema.json",
			});
		});

		it("should fall back to normal transformation when key not in entrypoints", () => {
			const entrypoints = new Map([["other.json", "./generated/other.json"]]);

			const result = transformStringExport("./src/index.ts", true, "./index.json", entrypoints);
			expect(result).toEqual({
				types: "./index.d.ts",
				import: "./index.js",
			});
		});

		it("should fall back to normal transformation when exportKey is undefined", () => {
			const entrypoints = new Map([["schema.json", "./generated/schema.json"]]);

			const result = transformStringExport("./src/index.ts", true, undefined, entrypoints);
			expect(result).toEqual({
				types: "./index.d.ts",
				import: "./index.js",
			});
		});

		it("should fall back to normal transformation when entrypoints is undefined", () => {
			const result = transformStringExport("./src/index.ts", true, "./index.ts", undefined);
			expect(result).toEqual({
				types: "./index.d.ts",
				import: "./index.js",
			});
		});

		it("should handle export keys without ./ prefix", () => {
			const entrypoints = new Map([["utils.js", "./dist/utils.js"]]);

			const result = transformStringExport("./src/utils.js", true, "utils.js", entrypoints);
			expect(result).toBe("./dist/utils.js");
		});

		it("should handle entrypoints.get returning undefined and use exportString fallback", () => {
			// Create a map without the key to test the fallback behavior
			const entrypoints = new Map<string, string>([
				["./other.js", "./dist/other.js"], // Different key to ensure our key is not found
			]);

			const result = transformStringExport("./src/utils.ts", true, "./utils.js", entrypoints);
			expect(result).toEqual({
				types: "./utils.d.ts",
				import: "./utils.js",
			});
		});

		it("should handle entrypoints.get with keyWithoutPrefix returning undefined", () => {
			// Create a map without the key (with or without prefix) to test the fallback behavior
			const entrypoints = new Map<string, string>([
				["other.js", "./dist/other.js"], // Different key to ensure our key is not found
			]);

			const result = transformStringExport("./src/utils.ts", true, "./utils.js", entrypoints);
			expect(result).toEqual({
				types: "./utils.d.ts",
				import: "./utils.js",
			});
		});
	});

	describe("transformArrayExports edge cases", () => {
		it("should handle transformPackageExports returning null/undefined", () => {
			// Create a scenario where transformPackageExports might return undefined
			const exportsArray = [null, undefined, "./src/index.js"];
			const result = transformArrayExports(exportsArray, true, "./test");
			expect(result).toEqual([null, undefined, "./index.js"]);
		});
	});

	describe("collapseIndex parameter behavior", () => {
		describe("transformStringExport with collapseIndex", () => {
			it("should collapse /index.ts to flat file when collapseIndex is true", () => {
				const result = transformStringExport("./src/rslib/index.ts", true, undefined, undefined, undefined, true);
				expect(result).toEqual({
					types: "./rslib.d.ts",
					import: "./rslib.js",
				});
			});

			it("should preserve /index.ts structure when collapseIndex is false", () => {
				const result = transformStringExport("./src/rslib/index.ts", true, undefined, undefined, undefined, false);
				expect(result).toEqual({
					types: "./rslib/index.d.ts",
					import: "./rslib/index.js",
				});
			});

			it("should default to collapseIndex false when not specified", () => {
				const result = transformStringExport("./src/rslib/index.ts", true);
				expect(result).toEqual({
					types: "./rslib/index.d.ts",
					import: "./rslib/index.js",
				});
			});
		});

		describe("transformStringExport with exportToOutputMap", () => {
			it("should use mapped path when exportToOutputMap has the key", () => {
				const exportToOutputMap = new Map<string, string>([[".", "./custom-output.js"]]);
				const result = transformStringExport("./src/index.ts", true, ".", undefined, exportToOutputMap);
				expect(result).toEqual({
					types: "./custom-output.d.ts",
					import: "./custom-output.js",
				});
			});

			it("should throw error when mapped path is undefined", () => {
				const exportToOutputMap = new Map<string, string>([[".", undefined as unknown as string]]);
				expect(() => {
					transformStringExport("./src/index.ts", true, ".", undefined, exportToOutputMap);
				}).toThrow('Export key "." has no mapped path');
			});
		});

		describe("transformPackageExports with collapseIndex", () => {
			it("should handle simple string export when collapseIndex is true", () => {
				const exports: FlexibleExports = "./src/rslib/index.ts";
				const result = transformPackageExports(exports, true, undefined, undefined, undefined, true);
				expect(result).toEqual({
					types: "./rslib.d.ts",
					import: "./rslib.js",
				});
			});

			it("should handle simple string export when collapseIndex is false", () => {
				const exports: FlexibleExports = "./src/rslib/index.ts";
				const result = transformPackageExports(exports, true, undefined, undefined, undefined, false);
				expect(result).toEqual({
					types: "./rslib/index.d.ts",
					import: "./rslib/index.js",
				});
			});

			it("should handle object exports when collapseIndex is true", () => {
				const exports: FlexibleExports = {
					"./rslib": "./src/rslib/index.ts",
					"./commitlint": "./src/commitlint.ts",
					"./vitest": "./src/vitest.ts",
				};
				const result = transformPackageExports(exports, true, undefined, undefined, undefined, true);
				expect(result).toEqual({
					"./rslib": {
						types: "./rslib.d.ts",
						import: "./rslib.js",
					},
					"./commitlint": {
						types: "./commitlint.d.ts",
						import: "./commitlint.js",
					},
					"./vitest": {
						types: "./vitest.d.ts",
						import: "./vitest.js",
					},
				});
			});

			it("should handle object exports when collapseIndex is false", () => {
				const exports: FlexibleExports = {
					"./rslib": "./src/rslib/index.ts",
					"./commitlint": "./src/commitlint.ts",
					"./vitest": "./src/vitest.ts",
				};
				const result = transformPackageExports(exports, true, undefined, undefined, undefined, false);
				expect(result).toEqual({
					"./rslib": {
						types: "./rslib/index.d.ts",
						import: "./rslib/index.js",
					},
					"./commitlint": {
						types: "./commitlint.d.ts",
						import: "./commitlint.js",
					},
					"./vitest": {
						types: "./vitest.d.ts",
						import: "./vitest.js",
					},
				});
			});

			it("should handle nested export conditions when collapseIndex is true", () => {
				const exports: FlexibleExports = {
					".": {
						types: "./src/index.d.ts",
						import: "./src/rslib/index.ts",
					},
				};
				const result = transformPackageExports(exports, true, undefined, undefined, undefined, true);
				expect(result).toEqual({
					".": {
						types: "./index.d.ts",
						import: "./rslib.js",
					},
				});
			});

			it("should handle nested export conditions when collapseIndex is false", () => {
				const exports: FlexibleExports = {
					".": {
						types: "./src/index.d.ts",
						import: "./src/rslib/index.ts",
					},
				};
				const result = transformPackageExports(exports, true, undefined, undefined, undefined, false);
				expect(result).toEqual({
					".": {
						types: "./index.d.ts",
						import: "./rslib/index.js",
					},
				});
			});
		});
	});
});
