import type { PackageJson } from "type-fest";
import { describe, expect, it } from "vitest";
import { applyRslibTransformations } from "./package-json-transformer.js";

describe("rslib-transform-utils", () => {
	describe("applyRslibTransformations", () => {
		it("should remove publishConfig and scripts but keep devDependencies", () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					react: "^18.0.0",
				},
				devDependencies: {
					vitest: "^1.0.0",
				},
				scripts: {
					build: "rslib build",
					test: "vitest",
				},
				publishConfig: {
					access: "public",
					directory: "dist",
				},
			};

			const originalPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					react: "^18.0.0",
				},
				devDependencies: {
					vitest: "^1.0.0",
				},
				scripts: {
					build: "rslib build",
					test: "vitest",
				},
				publishConfig: {
					access: "public",
					directory: "dist",
				},
			};

			const result = applyRslibTransformations(packageJson, originalPackageJson);

			expect(result).toEqual({
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					react: "^18.0.0",
				},
				devDependencies: {
					vitest: "^1.0.0",
				},
				private: false, // Should be false because publishConfig.access is "public"
			});
		});

		it("should set private field based on publishConfig.access", () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
			};

			const originalPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				publishConfig: {
					access: "public",
				},
			};

			const result = applyRslibTransformations(packageJson, originalPackageJson);
			expect(result.private).toBe(false);
		});

		it("should transform exports from .ts to .js with types", () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				exports: {
					".": "./src/index.ts",
					"./utils": "./src/utils.ts",
				},
			};

			const result = applyRslibTransformations(packageJson, packageJson);

			expect(result.exports).toEqual({
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

		it("should transform string exports to .js with types", () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				exports: "./src/index.ts",
			};

			const result = applyRslibTransformations(packageJson, packageJson);

			expect(result.exports).toEqual({
				types: "./index.d.ts",
				import: "./index.js",
			});
		});

		it("should not transform non-TypeScript exports", () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				exports: {
					".": "./dist/index.js",
					"./utils": "./dist/utils.js",
				},
			};

			const result = applyRslibTransformations(packageJson, packageJson);

			expect(result.exports).toEqual({
				".": "./dist/index.js",
				"./utils": "./dist/utils.js",
			});
		});

		it("should transform TypeScript exports to .js with types (no special JSON handling)", () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				exports: {
					"./schema.json": "./src/schema.ts",
					"./config.json": "./src/config.ts",
					".": "./src/index.ts",
				},
			};

			const result = applyRslibTransformations(packageJson, packageJson);

			expect(result.exports).toEqual({
				"./schema.json": {
					types: "./schema.d.ts",
					import: "./schema.js",
				},
				"./config.json": {
					types: "./config.d.ts",
					import: "./config.js",
				},
				".": {
					types: "./index.d.ts",
					import: "./index.js",
				},
			});
		});

		it("should handle conditional exports with TypeScript files (no special JSON handling)", () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				exports: {
					"./schema.json": {
						import: "./src/schema.ts",
						require: "./src/schema-cjs.ts",
					},
					".": "./src/index.ts",
				},
			};

			const result = applyRslibTransformations(packageJson, packageJson);

			expect(result.exports).toEqual({
				"./schema.json": {
					import: "./schema.js", // TypeScript export - converted to .js
					require: "./schema-cjs.js", // TypeScript export - converted to .js
				},
				".": {
					types: "./index.d.ts",
					import: "./index.js",
				},
			});
		});

		it("should not affect JSON exports pointing to non-TypeScript files", () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				exports: {
					"./data.json": "./data/static.json",
					"./config.json": "./config/env.json",
					".": "./src/index.ts",
				},
			};

			const result = applyRslibTransformations(packageJson, packageJson);

			expect(result.exports).toEqual({
				"./data.json": "./data/static.json", // Non-TS JSON - unchanged
				"./config.json": "./config/env.json", // Non-TS JSON - unchanged
				".": {
					types: "./index.d.ts",
					import: "./index.js",
				},
			});
		});

		it("should transform bin field", () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				bin: {
					"my-cli": "./src/cli.ts",
					"my-tool": "./src/tool.ts",
				},
			};

			const result = applyRslibTransformations(packageJson, packageJson);

			// TypeScript bin entries are compiled to ./bin/{command}.js
			expect(result.bin).toEqual({
				"my-cli": "./bin/my-cli.js",
				"my-tool": "./bin/my-tool.js",
			});
		});

		it("should transform string bin field", () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				bin: "./src/cli.ts",
			};

			const result = applyRslibTransformations(packageJson, packageJson);

			// Single TypeScript bin entry compiles to ./bin/cli.js
			expect(result.bin).toBe("./bin/cli.js");
		});

		it("should transform files array", () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
			};

			const originalPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				files: ["./public/index.js", "public/utils.js", "dist/", "README.md"],
			};

			const result = applyRslibTransformations(packageJson, originalPackageJson);

			expect(result.files).toEqual(["index.js", "utils.js", "dist/", "README.md"]);
		});

		it("should transform typesVersions", () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
			};

			const originalPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				typesVersions: {
					"*": {
						"*": ["./src/index.ts"],
						utils: ["./src/utils.ts"],
					},
				},
			};

			const result = applyRslibTransformations(packageJson, originalPackageJson);

			expect(result.typesVersions).toEqual({
				"*": {
					"*": ["./index.js"],
					utils: ["./utils.js"],
				},
			});
		});

		it("should handle .d.ts files by not adding types field but still transforming path", () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				exports: {
					".": "./src/index.d.ts",
					"./types": "./src/types.d.ts",
				},
			};

			const result = applyRslibTransformations(packageJson, packageJson);

			// .d.ts files should be transformed to the build output but not get types field
			expect(result.exports).toEqual({
				".": "./index.d.ts",
				"./types": "./types.d.ts",
			});
		});

		it("should handle bin field with only non-TypeScript files", () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				bin: {
					"my-cli": "./scripts/cli.sh",
					"my-tool": "./dist/tool.js",
				},
			};

			const result = applyRslibTransformations(packageJson, packageJson);

			expect(result.bin).toEqual({
				"my-cli": "./scripts/cli.sh",
				"my-tool": "./dist/tool.js",
			});
		});

		it("should handle string bin field with non-TypeScript file", () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				bin: "./scripts/cli.sh",
			};

			const result = applyRslibTransformations(packageJson, packageJson);

			expect(result.bin).toBe("./scripts/cli.sh");
		});

		it("should handle string bin field with shell script", () => {
			const packageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				bin: "./bin/start.sh",
			};

			const result = applyRslibTransformations(packageJson, packageJson);

			// Shell scripts should not be transformed
			expect(result.bin).toBe("./bin/start.sh");
		});
	});
});
