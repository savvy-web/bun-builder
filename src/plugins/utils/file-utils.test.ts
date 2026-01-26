/**
 * Unit tests for file system utilities.
 */

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { fileExistAsync, getUnscopedPackageName, packageJsonVersion } from "./file-utils.js";

describe("fileExistAsync", () => {
	test("returns true for existing file", async () => {
		const result = await fileExistAsync("package.json");

		expect(result.assetName).toBe("package.json");
		expect(result.assetPath).toBe(join(process.cwd(), "package.json"));
		expect(result.assetExists).toBe(true);
	});

	test("returns false for non-existing file", async () => {
		const result = await fileExistAsync("non-existent-file-12345.txt");

		expect(result.assetName).toBe("non-existent-file-12345.txt");
		expect(result.assetExists).toBe(false);
	});

	test("handles nested paths", async () => {
		const result = await fileExistAsync("src/index.ts");

		expect(result.assetName).toBe("src/index.ts");
		expect(result.assetPath).toBe(join(process.cwd(), "src/index.ts"));
		expect(result.assetExists).toBe(true);
	});
});

describe("packageJsonVersion", () => {
	test("returns version from package.json", async () => {
		const version = await packageJsonVersion();

		// Should return a valid semver-like version string
		expect(typeof version).toBe("string");
		expect(version.length).toBeGreaterThan(0);
		expect(version).toMatch(/^\d+\.\d+\.\d+/);
	});
});

describe("getUnscopedPackageName", () => {
	test("removes scope from scoped package name", () => {
		expect(getUnscopedPackageName("@savvy-web/bun-builder")).toBe("bun-builder");
	});

	test("handles scoped names with slashes in package name", () => {
		// Note: npm scoped packages only have one "/" between scope and name
		// "@org/sub/package" is not a valid npm package name
		// The function splits on "/" and returns the second element
		expect(getUnscopedPackageName("@org/my-package")).toBe("my-package");
	});

	test("returns unscoped name unchanged", () => {
		expect(getUnscopedPackageName("lodash")).toBe("lodash");
	});

	test("returns empty string for @scope only", () => {
		// Edge case - malformed package name
		expect(getUnscopedPackageName("@scope/")).toBe("");
	});

	test("handles package names with hyphens", () => {
		expect(getUnscopedPackageName("@types/node")).toBe("node");
		expect(getUnscopedPackageName("my-package")).toBe("my-package");
	});
});
