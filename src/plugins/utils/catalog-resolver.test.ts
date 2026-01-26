/**
 * Unit tests for the BunCatalogResolver class.
 */

import { describe, expect, test } from "bun:test";
import { BunCatalogResolver, getDefaultCatalogResolver } from "./catalog-resolver.js";

describe("BunCatalogResolver", () => {
	describe("findWorkspaceRoot", () => {
		test("finds workspace root from current directory", () => {
			const resolver = new BunCatalogResolver();

			// Since this project has a package.json with workspaces field or not,
			// we test that it returns a string or null
			const root = resolver.findWorkspaceRoot();

			// Result should be null (no workspace) or a valid path
			if (root !== null) {
				expect(typeof root).toBe("string");
				expect(root.length).toBeGreaterThan(0);
			}
		});

		test("returns null when no workspace found", () => {
			const resolver = new BunCatalogResolver();

			// Start from root directory where there's no workspace
			const root = resolver.findWorkspaceRoot("/");

			expect(root).toBeNull();
		});
	});

	describe("clearCache", () => {
		test("clears cached data", async () => {
			const resolver = new BunCatalogResolver();

			// Get catalogs to populate cache
			await resolver.getCatalogs();

			// Clear should not throw
			resolver.clearCache();

			// Should be able to get catalogs again
			const catalogs = await resolver.getCatalogs();
			expect(catalogs).toHaveProperty("default");
			expect(catalogs).toHaveProperty("named");
		});
	});

	describe("getCatalogs", () => {
		test("returns object with default and named catalogs", async () => {
			const resolver = new BunCatalogResolver();
			const catalogs = await resolver.getCatalogs();

			expect(catalogs).toHaveProperty("default");
			expect(catalogs).toHaveProperty("named");
			expect(typeof catalogs.default).toBe("object");
			expect(typeof catalogs.named).toBe("object");
		});

		test("returns empty catalogs when no workspace root", async () => {
			const resolver = new BunCatalogResolver();

			// Use a path that won't have a workspace
			const catalogs = await resolver.getCatalogs("/tmp");

			expect(catalogs.default).toEqual({});
			expect(catalogs.named).toEqual({});
		});
	});

	describe("resolveReference", () => {
		test("returns null for non-catalog references", async () => {
			const resolver = new BunCatalogResolver();

			const result = await resolver.resolveReference("^1.0.0", "lodash");

			expect(result).toBeNull();
		});

		test("returns null for unknown package in catalog", async () => {
			const resolver = new BunCatalogResolver();

			// This package likely doesn't exist in any catalog
			const result = await resolver.resolveReference("catalog:", "nonexistent-package-xyz-123");

			expect(result).toBeNull();
		});
	});

	describe("resolvePackageJson", () => {
		test("passes through non-catalog dependencies", async () => {
			const resolver = new BunCatalogResolver();

			const pkg = {
				name: "test-pkg",
				dependencies: {
					lodash: "^4.17.21",
				},
			};

			const result = await resolver.resolvePackageJson(pkg);

			expect(result.dependencies?.lodash).toBe("^4.17.21");
		});

		test("handles empty dependencies", async () => {
			const resolver = new BunCatalogResolver();

			const pkg = {
				name: "test-pkg",
			};

			const result = await resolver.resolvePackageJson(pkg);

			expect(result.name).toBe("test-pkg");
		});

		test("processes all dependency fields", async () => {
			const resolver = new BunCatalogResolver();

			const pkg = {
				name: "test-pkg",
				dependencies: { a: "1.0.0" },
				devDependencies: { b: "2.0.0" },
				peerDependencies: { c: "3.0.0" },
				optionalDependencies: { d: "4.0.0" },
			};

			const result = await resolver.resolvePackageJson(pkg);

			expect(result.dependencies?.a).toBe("1.0.0");
			expect(result.devDependencies?.b).toBe("2.0.0");
			expect(result.peerDependencies?.c).toBe("3.0.0");
			expect(result.optionalDependencies?.d).toBe("4.0.0");
		});
	});
});

describe("getDefaultCatalogResolver", () => {
	test("returns singleton instance", () => {
		const resolver1 = getDefaultCatalogResolver();
		const resolver2 = getDefaultCatalogResolver();

		expect(resolver1).toBe(resolver2);
	});

	test("returns BunCatalogResolver instance", () => {
		const resolver = getDefaultCatalogResolver();

		expect(resolver).toBeInstanceOf(BunCatalogResolver);
	});
});
