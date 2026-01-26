/**
 * Unit tests for package.json transformation utilities.
 */

import { describe, expect, test } from "bun:test";
import type { PackageJson } from "../../types/package-json.js";
import {
	applyBuildTransformations,
	createTypePath,
	isConditionsObject,
	transformExportPath,
	transformPackageBin,
	transformPackageExports,
} from "./package-json-transformer.js";

describe("transformExportPath", () => {
	describe("prefix stripping", () => {
		test("strips ./src/ prefix", () => {
			expect(transformExportPath("./src/index.ts")).toBe("./index.js");
		});

		test("strips ./exports/ prefix", () => {
			expect(transformExportPath("./exports/api.ts")).toBe("./api.js");
		});

		test("strips ./public/ prefix", () => {
			expect(transformExportPath("./public/assets.ts")).toBe("./assets.js");
		});

		test("preserves paths without known prefixes", () => {
			expect(transformExportPath("./lib/index.ts")).toBe("./lib/index.js");
		});
	});

	describe("extension conversion", () => {
		test("converts .ts to .js", () => {
			expect(transformExportPath("./index.ts")).toBe("./index.js");
		});

		test("converts .tsx to .js", () => {
			expect(transformExportPath("./component.tsx")).toBe("./component.js");
		});

		test("preserves .d.ts files", () => {
			expect(transformExportPath("./types.d.ts")).toBe("./types.d.ts");
		});

		test("preserves .js files", () => {
			expect(transformExportPath("./index.js")).toBe("./index.js");
		});
	});

	describe("index collapsing", () => {
		test("collapses /index.ts to .js when enabled", () => {
			expect(transformExportPath("./src/utils/index.ts", true, true)).toBe("./utils.js");
		});

		test("collapses /index.tsx to .js when enabled", () => {
			expect(transformExportPath("./src/components/index.tsx", true, true)).toBe("./components.js");
		});

		test("does not collapse root ./index.ts", () => {
			expect(transformExportPath("./index.ts", true, true)).toBe("./index.js");
		});

		test("does not collapse when disabled", () => {
			expect(transformExportPath("./src/utils/index.ts", true, false)).toBe("./utils/index.js");
		});
	});

	describe("processTSExports flag", () => {
		test("skips TS processing when false", () => {
			expect(transformExportPath("./src/index.ts", false)).toBe("./index.ts");
		});
	});
});

describe("createTypePath", () => {
	test("converts .js to .d.ts", () => {
		expect(createTypePath("./index.js")).toBe("./index.d.ts");
	});

	test("collapses /index.js when enabled", () => {
		expect(createTypePath("./utils/index.js", true)).toBe("./utils.d.ts");
	});

	test("does not collapse root ./index.js", () => {
		expect(createTypePath("./index.js", true)).toBe("./index.d.ts");
	});

	test("does not collapse when disabled", () => {
		expect(createTypePath("./utils/index.js", false)).toBe("./utils/index.d.ts");
	});

	test("handles paths without .js extension", () => {
		expect(createTypePath("./utils")).toBe("./utils.d.ts");
	});
});

describe("transformPackageBin", () => {
	test("transforms string bin path", () => {
		expect(transformPackageBin("./src/cli.ts")).toBe("./bin/cli.js");
	});

	test("transforms tsx bin path", () => {
		expect(transformPackageBin("./src/cli.tsx")).toBe("./bin/cli.js");
	});

	test("preserves non-TypeScript bin paths", () => {
		expect(transformPackageBin("./bin/cli.js")).toBe("./bin/cli.js");
	});

	test("transforms object bin with multiple commands", () => {
		const result = transformPackageBin({
			"my-cli": "./src/bin/cli.ts",
			"my-tool": "./src/bin/tool.ts",
		});

		expect(result).toEqual({
			"my-cli": "./bin/my-cli.js",
			"my-tool": "./bin/my-tool.js",
		});
	});

	test("preserves non-TypeScript entries in object bin", () => {
		const result = transformPackageBin({
			"my-cli": "./bin/cli.js",
		});

		expect(result).toEqual({
			"my-cli": "./bin/cli.js",
		});
	});

	test("handles undefined bin", () => {
		expect(transformPackageBin(undefined)).toBeUndefined();
	});
});

describe("isConditionsObject", () => {
	test("returns true for import condition", () => {
		expect(isConditionsObject({ import: "./index.js" })).toBe(true);
	});

	test("returns true for require condition", () => {
		expect(isConditionsObject({ require: "./index.cjs" })).toBe(true);
	});

	test("returns true for types condition", () => {
		expect(isConditionsObject({ types: "./index.d.ts" })).toBe(true);
	});

	test("returns true for default condition", () => {
		expect(isConditionsObject({ default: "./index.js" })).toBe(true);
	});

	test("returns false for subpath exports", () => {
		expect(isConditionsObject({ ".": "./index.js", "./utils": "./utils.js" })).toBe(false);
	});
});

describe("transformPackageExports", () => {
	test("transforms string export to conditional export", () => {
		const result = transformPackageExports("./src/index.ts");

		expect(result).toEqual({
			types: "./index.d.ts",
			import: "./index.js",
		});
	});

	test("transforms subpath exports", () => {
		const result = transformPackageExports({
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
		const result = transformPackageExports({
			import: "./src/index.ts",
			types: "./src/index.d.ts",
		});

		expect(result).toEqual({
			import: "./index.js",
			types: "./index.d.ts",
		});
	});

	test("transforms nested conditional exports", () => {
		const result = transformPackageExports({
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
		const result = transformPackageExports(["./src/index.ts", "./src/fallback.ts"]);

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
		expect(transformPackageExports(null)).toBeNull();
		expect(transformPackageExports(undefined)).toBeUndefined();
	});

	test("skips TS processing when disabled", () => {
		const result = transformPackageExports("./src/index.ts", false);

		expect(result).toBe("./index.ts");
	});

	test("collapses index files when enabled", () => {
		const result = transformPackageExports("./src/utils/index.ts", true, undefined, true);

		expect(result).toEqual({
			types: "./utils.d.ts",
			import: "./utils.js",
		});
	});
});

describe("applyBuildTransformations", () => {
	test("removes publishConfig and scripts", () => {
		const pkg: PackageJson = {
			name: "test-package",
			publishConfig: { access: "public" },
			scripts: { build: "tsc" },
		};

		const result = applyBuildTransformations(pkg, pkg);

		expect(result.publishConfig).toBeUndefined();
		expect(result.scripts).toBeUndefined();
	});

	test("sets private to false when publishConfig.access is public", () => {
		const pkg: PackageJson = {
			name: "test-package",
			publishConfig: { access: "public" },
		};

		const result = applyBuildTransformations(pkg, pkg);

		expect(result.private).toBe(false);
	});

	test("sets private to true when publishConfig.access is not public", () => {
		const pkg: PackageJson = {
			name: "test-package",
			publishConfig: { access: "restricted" },
		};

		const result = applyBuildTransformations(pkg, pkg);

		expect(result.private).toBe(true);
	});

	test("sets private to true when no publishConfig", () => {
		const pkg: PackageJson = {
			name: "test-package",
		};

		const result = applyBuildTransformations(pkg, pkg);

		expect(result.private).toBe(true);
	});

	test("transforms exports field", () => {
		const pkg: PackageJson = {
			name: "test-package",
			exports: {
				".": "./src/index.ts",
			},
		};

		const result = applyBuildTransformations(pkg, pkg);

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

		const result = applyBuildTransformations(pkg, pkg);

		expect(result.bin).toEqual({
			cli: "./bin/cli.js",
		});
	});

	test("transforms files array", () => {
		const original: PackageJson = {
			name: "test-package",
			files: ["./public/assets", "public/config"],
		};

		const result = applyBuildTransformations(original, original);

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

		const result = applyBuildTransformations(original, original);

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

		const result = applyBuildTransformations(pkg, pkg);

		// sort-package-json puts name before version
		const keys = Object.keys(result);
		expect(keys.indexOf("name")).toBeLessThan(keys.indexOf("version"));
	});
});
