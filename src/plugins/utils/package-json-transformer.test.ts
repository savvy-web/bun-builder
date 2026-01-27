/**
 * Unit tests for package.json transformation utilities.
 */

import { describe, expect, test } from "bun:test";
import type { PackageJson } from "../../types/package-json.js";
import { PackageJsonTransformer } from "./package-json-transformer.js";

describe("PackageJsonTransformer.transformExportPath", () => {
	describe("prefix stripping", () => {
		test("strips ./src/ prefix", () => {
			expect(PackageJsonTransformer.transformExportPath("./src/index.ts")).toBe("./index.js");
		});

		test("strips ./exports/ prefix", () => {
			expect(PackageJsonTransformer.transformExportPath("./exports/api.ts")).toBe("./api.js");
		});

		test("strips ./public/ prefix", () => {
			expect(PackageJsonTransformer.transformExportPath("./public/assets.ts")).toBe("./assets.js");
		});

		test("preserves paths without known prefixes", () => {
			expect(PackageJsonTransformer.transformExportPath("./lib/index.ts")).toBe("./lib/index.js");
		});
	});

	describe("extension conversion", () => {
		test("converts .ts to .js", () => {
			expect(PackageJsonTransformer.transformExportPath("./index.ts")).toBe("./index.js");
		});

		test("converts .tsx to .js", () => {
			expect(PackageJsonTransformer.transformExportPath("./component.tsx")).toBe("./component.js");
		});

		test("preserves .d.ts files", () => {
			expect(PackageJsonTransformer.transformExportPath("./types.d.ts")).toBe("./types.d.ts");
		});

		test("preserves .js files", () => {
			expect(PackageJsonTransformer.transformExportPath("./index.js")).toBe("./index.js");
		});
	});

	describe("index collapsing", () => {
		test("collapses /index.ts to .js when enabled", () => {
			expect(PackageJsonTransformer.transformExportPath("./src/utils/index.ts", true, true)).toBe("./utils.js");
		});

		test("collapses /index.tsx to .js when enabled", () => {
			expect(PackageJsonTransformer.transformExportPath("./src/components/index.tsx", true, true)).toBe(
				"./components.js",
			);
		});

		test("does not collapse root ./index.ts", () => {
			expect(PackageJsonTransformer.transformExportPath("./index.ts", true, true)).toBe("./index.js");
		});

		test("does not collapse when disabled", () => {
			expect(PackageJsonTransformer.transformExportPath("./src/utils/index.ts", true, false)).toBe("./utils/index.js");
		});
	});

	describe("processTSExports flag", () => {
		test("skips TS processing when false", () => {
			expect(PackageJsonTransformer.transformExportPath("./src/index.ts", false)).toBe("./index.ts");
		});
	});
});

describe("PackageJsonTransformer.createTypePath", () => {
	test("converts .js to .d.ts", () => {
		expect(PackageJsonTransformer.createTypePath("./index.js")).toBe("./index.d.ts");
	});

	test("collapses /index.js when enabled", () => {
		expect(PackageJsonTransformer.createTypePath("./utils/index.js", true)).toBe("./utils.d.ts");
	});

	test("does not collapse root ./index.js", () => {
		expect(PackageJsonTransformer.createTypePath("./index.js", true)).toBe("./index.d.ts");
	});

	test("does not collapse when disabled", () => {
		expect(PackageJsonTransformer.createTypePath("./utils/index.js", false)).toBe("./utils/index.d.ts");
	});

	test("handles paths without .js extension", () => {
		expect(PackageJsonTransformer.createTypePath("./utils")).toBe("./utils.d.ts");
	});
});

describe("PackageJsonTransformer.transformBin", () => {
	test("transforms string bin path", () => {
		expect(PackageJsonTransformer.transformBin("./src/cli.ts")).toBe("./bin/cli.js");
	});

	test("transforms tsx bin path", () => {
		expect(PackageJsonTransformer.transformBin("./src/cli.tsx")).toBe("./bin/cli.js");
	});

	test("preserves non-TypeScript bin paths", () => {
		expect(PackageJsonTransformer.transformBin("./bin/cli.js")).toBe("./bin/cli.js");
	});

	test("transforms object bin with multiple commands", () => {
		const result = PackageJsonTransformer.transformBin({
			"my-cli": "./src/bin/cli.ts",
			"my-tool": "./src/bin/tool.ts",
		});

		expect(result).toEqual({
			"my-cli": "./bin/my-cli.js",
			"my-tool": "./bin/my-tool.js",
		});
	});

	test("preserves non-TypeScript entries in object bin", () => {
		const result = PackageJsonTransformer.transformBin({
			"my-cli": "./bin/cli.js",
		});

		expect(result).toEqual({
			"my-cli": "./bin/cli.js",
		});
	});

	test("handles undefined bin", () => {
		expect(PackageJsonTransformer.transformBin(undefined)).toBeUndefined();
	});
});

describe("PackageJsonTransformer.isConditionsObject", () => {
	test("returns true for import condition", () => {
		expect(PackageJsonTransformer.isConditionsObject({ import: "./index.js" })).toBe(true);
	});

	test("returns true for require condition", () => {
		expect(PackageJsonTransformer.isConditionsObject({ require: "./index.cjs" })).toBe(true);
	});

	test("returns true for types condition", () => {
		expect(PackageJsonTransformer.isConditionsObject({ types: "./index.d.ts" })).toBe(true);
	});

	test("returns true for default condition", () => {
		expect(PackageJsonTransformer.isConditionsObject({ default: "./index.js" })).toBe(true);
	});

	test("returns false for subpath exports", () => {
		expect(PackageJsonTransformer.isConditionsObject({ ".": "./index.js", "./utils": "./utils.js" })).toBe(false);
	});
});

describe("PackageJsonTransformer.transformExports", () => {
	test("transforms string export to conditional export", () => {
		const result = PackageJsonTransformer.transformExports("./src/index.ts");

		expect(result).toEqual({
			types: "./index.d.ts",
			import: "./index.js",
		});
	});

	test("transforms subpath exports", () => {
		const result = PackageJsonTransformer.transformExports({
			".": "./src/index.ts",
			"./utils": "./src/utils.ts",
		});

		expect(result).toEqual({
			".": {
				types: "./index.d.ts",
				import: "./index.js",
			},
			"./utils": {
				types: "./utils.d.ts",
				import: "./utils.js",
			},
		});
	});

	test("transforms existing conditional exports", () => {
		const result = PackageJsonTransformer.transformExports({
			import: "./src/index.ts",
			types: "./src/index.d.ts",
		});

		expect(result).toEqual({
			import: "./index.js",
			types: "./index.d.ts",
		});
	});

	test("transforms nested conditional exports", () => {
		const result = PackageJsonTransformer.transformExports({
			".": {
				import: "./src/index.ts",
				types: "./src/index.d.ts",
			},
		});

		expect(result).toEqual({
			".": {
				import: "./index.js",
				types: "./index.d.ts",
			},
		});
	});

	test("handles array exports", () => {
		const result = PackageJsonTransformer.transformExports(["./src/index.ts", "./src/fallback.ts"]);

		expect(result).toEqual([
			{
				types: "./index.d.ts",
				import: "./index.js",
			},
			{
				types: "./fallback.d.ts",
				import: "./fallback.js",
			},
		]);
	});

	test("handles null and undefined", () => {
		expect(PackageJsonTransformer.transformExports(null)).toBeNull();
		expect(PackageJsonTransformer.transformExports(undefined)).toBeUndefined();
	});

	test("skips TS processing when disabled", () => {
		const result = PackageJsonTransformer.transformExports("./src/index.ts", false);

		expect(result).toBe("./index.ts");
	});

	test("collapses index files when enabled", () => {
		const result = PackageJsonTransformer.transformExports("./src/utils/index.ts", true, undefined, true);

		expect(result).toEqual({
			types: "./utils.d.ts",
			import: "./utils.js",
		});
	});
});

describe("PackageJsonTransformer.applyBuildTransformations", () => {
	test("removes publishConfig and scripts", () => {
		const pkg: PackageJson = {
			name: "test-package",
			publishConfig: { access: "public" },
			scripts: { build: "tsc" },
		};

		const result = PackageJsonTransformer.applyBuildTransformations(pkg, pkg);

		expect(result.publishConfig).toBeUndefined();
		expect(result.scripts).toBeUndefined();
	});

	test("sets private to false when publishConfig.access is public", () => {
		const pkg: PackageJson = {
			name: "test-package",
			publishConfig: { access: "public" },
		};

		const result = PackageJsonTransformer.applyBuildTransformations(pkg, pkg);

		expect(result.private).toBe(false);
	});

	test("sets private to true when publishConfig.access is not public", () => {
		const pkg: PackageJson = {
			name: "test-package",
			publishConfig: { access: "restricted" },
		};

		const result = PackageJsonTransformer.applyBuildTransformations(pkg, pkg);

		expect(result.private).toBe(true);
	});

	test("sets private to true when no publishConfig", () => {
		const pkg: PackageJson = {
			name: "test-package",
		};

		const result = PackageJsonTransformer.applyBuildTransformations(pkg, pkg);

		expect(result.private).toBe(true);
	});

	test("transforms exports field", () => {
		const pkg: PackageJson = {
			name: "test-package",
			exports: {
				".": "./src/index.ts",
			},
		};

		const result = PackageJsonTransformer.applyBuildTransformations(pkg, pkg);

		expect(result.exports).toEqual({
			".": {
				types: "./index.d.ts",
				import: "./index.js",
			},
		});
	});

	test("transforms bin field", () => {
		const pkg: PackageJson = {
			name: "test-package",
			bin: {
				cli: "./src/cli.ts",
			},
		};

		const result = PackageJsonTransformer.applyBuildTransformations(pkg, pkg);

		expect(result.bin).toEqual({
			cli: "./bin/cli.js",
		});
	});

	test("transforms files array", () => {
		const original: PackageJson = {
			name: "test-package",
			files: ["./public/assets", "public/config"],
		};

		const result = PackageJsonTransformer.applyBuildTransformations(original, original);

		expect(result.files).toEqual(["assets", "config"]);
	});

	test("transforms typesVersions", () => {
		const original: PackageJson = {
			name: "test-package",
			typesVersions: {
				"*": {
					"*": ["./src/*.ts"],
				},
			},
		};

		const result = PackageJsonTransformer.applyBuildTransformations(original, original);

		expect(result.typesVersions).toEqual({
			"*": {
				"*": ["./*.js"],
			},
		});
	});

	test("sorts output with sort-package-json", () => {
		const pkg: PackageJson = {
			version: "1.0.0",
			name: "test-package",
			description: "Test",
		};

		const result = PackageJsonTransformer.applyBuildTransformations(pkg, pkg);

		// sort-package-json puts name before version
		const keys = Object.keys(result);
		expect(keys.indexOf("name")).toBeLessThan(keys.indexOf("version"));
	});
});
