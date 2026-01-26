import type { PackageJson } from "type-fest";
import { describe, expect, it } from "vitest";
import { transformPackageBin } from "./package-json-transformer.js";

describe("bin-transform-utils", () => {
	describe("transformPackageBin", () => {
		it("should transform string bin field", () => {
			const result = transformPackageBin("./src/cli.ts");
			// Single TypeScript bin entry compiles to ./bin/cli.js
			expect(result).toBe("./bin/cli.js");
		});

		it("should transform object bin field", () => {
			const result = transformPackageBin({
				"my-cli": "./src/cli.ts",
				"my-tool": "./src/tool.ts",
			});
			// TypeScript bin entries are compiled to ./bin/{command}.js
			expect(result).toEqual({
				"my-cli": "./bin/my-cli.js",
				"my-tool": "./bin/my-tool.js",
			});
		});

		it("should handle bin field with undefined values", () => {
			const bin = {
				"my-cli": "./src/cli.ts",
				"my-tool": undefined,
			};

			const result = transformPackageBin(bin);

			// TypeScript bin entries are compiled to ./bin/{command}.js
			expect(result).toEqual({
				"my-cli": "./bin/my-cli.js",
			});
		});

		it("should handle bin field with only non-TypeScript files", () => {
			const result = transformPackageBin({
				"my-cli": "./scripts/cli.sh",
				"my-tool": "./dist/tool.js",
			});
			// Non-TypeScript entries are preserved as-is
			expect(result).toEqual({
				"my-cli": "./scripts/cli.sh",
				"my-tool": "./dist/tool.js",
			});
		});

		it("should handle string bin field with non-TypeScript file", () => {
			const result = transformPackageBin("./scripts/cli.sh");
			// Non-TypeScript entries are preserved as-is
			expect(result).toBe("./scripts/cli.sh");
		});

		it("should handle string bin field with shell script", () => {
			const result = transformPackageBin("./bin/start.sh");
			// Shell scripts are preserved as-is
			expect(result).toBe("./bin/start.sh");
		});

		it("should transform TypeScript even when processTSExports is false (deprecated param)", () => {
			// The processTSExports parameter is deprecated and no longer affects bin transformation
			const result = transformPackageBin("./src/cli.ts", false);
			expect(result).toBe("./bin/cli.js");
		});

		it("should transform object bin TypeScript even when processTSExports is false (deprecated param)", () => {
			// The processTSExports parameter is deprecated and no longer affects bin transformation
			const result = transformPackageBin(
				{
					"my-cli": "./src/cli.ts",
					"my-tool": "./src/tool.ts",
				},
				false,
			);
			expect(result).toEqual({
				"my-cli": "./bin/my-cli.js",
				"my-tool": "./bin/my-tool.js",
			});
		});

		it("should handle null/undefined bin field", () => {
			expect(transformPackageBin(null as unknown as PackageJson["bin"])).toBeNull();
			expect(transformPackageBin(undefined)).toBeUndefined();
		});

		it("should transform bin/ prefix TypeScript to ./bin/{command}.js", () => {
			// Even if source is already in bin/, the TypeScript file is compiled to ./bin/cli.js
			const result = transformPackageBin("./bin/cli.ts");
			expect(result).toBe("./bin/cli.js");
		});
	});
});
