import type { PackageJson } from "type-fest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMockStats } from "../../../__test__/rslib/utils/test-types.js";

// Mock external dependencies before importing the module
vi.mock("workspace-tools");
vi.mock("node:fs/promises", () => ({
	stat: vi.fn().mockRejectedValue(new Error("ENOENT")),
	readFile: vi.fn(),
}));
vi.mock("yaml", async (importOriginal) => {
	const actual = await importOriginal<typeof import("yaml")>();
	return {
		parse: vi.fn(actual.parse),
	};
});
vi.mock("@pnpm/exportable-manifest", () => ({
	createExportableManifest: vi.fn(),
}));

import { readFile, stat } from "node:fs/promises";
import { createExportableManifest } from "@pnpm/exportable-manifest";
import { getWorkspaceRoot } from "workspace-tools";
import { parse } from "yaml";
import { PnpmCatalog } from "./pnpm-catalog.js";

describe("PnpmCatalog", () => {
	let catalog: PnpmCatalog;

	beforeEach(() => {
		vi.clearAllMocks();
		catalog = new PnpmCatalog();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("getCatalog", () => {
		it("should return empty object when workspace root is not found", async () => {
			vi.mocked(getWorkspaceRoot).mockReturnValue(undefined);

			const result = await catalog.getCatalog();

			expect(result).toEqual({});
		});

		it("should return empty object on ENOENT error", async () => {
			vi.mocked(getWorkspaceRoot).mockReturnValue("/test/workspace");
			const enoentError = new Error("ENOENT: no such file or directory, open 'pnpm-workspace.yaml'");
			vi.mocked(stat).mockRejectedValue(enoentError);

			const result = await catalog.getCatalog();

			expect(result).toEqual({});
		});

		it("should return empty object on YAML parse error", async () => {
			vi.mocked(getWorkspaceRoot).mockReturnValue("/test/workspace");
			vi.mocked(stat).mockResolvedValue(createMockStats(new Date(123456789)));
			vi.mocked(readFile).mockResolvedValue("invalid yaml [");
			vi.mocked(parse).mockImplementationOnce(() => {
				throw new Error("YAML parse error: invalid syntax");
			});

			const result = await catalog.getCatalog();

			expect(result).toEqual({});
		});

		it("should return empty object on generic error", async () => {
			vi.mocked(getWorkspaceRoot).mockReturnValue("/test/workspace");
			vi.mocked(stat).mockResolvedValue(createMockStats(new Date(123456789)));
			vi.mocked(readFile).mockRejectedValue(new Error("Permission denied"));

			const result = await catalog.getCatalog();

			expect(result).toEqual({});
		});

		it("should successfully read catalog from pnpm-workspace.yaml", async () => {
			vi.mocked(getWorkspaceRoot).mockReturnValue("/test/workspace");
			vi.mocked(stat).mockResolvedValue(createMockStats(new Date(123456789)));
			vi.mocked(readFile).mockResolvedValue(`
packages:
  - 'packages/*'
catalog:
  react: '^18.0.0'
  typescript: '^5.0.0'
`);

			const result = await catalog.getCatalog();

			expect(result).toEqual({
				react: "^18.0.0",
				typescript: "^5.0.0",
			});
		});

		it("should return empty object when catalog section is missing", async () => {
			vi.mocked(getWorkspaceRoot).mockReturnValue("/test/workspace");
			vi.mocked(stat).mockResolvedValue(createMockStats(new Date(123456789)));
			vi.mocked(readFile).mockResolvedValue(`
packages:
  - 'packages/*'
`);

			const result = await catalog.getCatalog();

			expect(result).toEqual({});
		});

		it("should cache catalog based on file mtime", async () => {
			vi.mocked(getWorkspaceRoot).mockReturnValue("/test/workspace");
			vi.mocked(stat).mockResolvedValue(createMockStats(new Date(999999999)));
			vi.mocked(readFile).mockResolvedValue(`
catalog:
  lodash: '^4.17.21'
`);

			// First call
			const result1 = await catalog.getCatalog();
			expect(result1).toEqual({ lodash: "^4.17.21" });

			// Clear readFile mock to verify cache is used
			vi.mocked(readFile).mockClear();

			// Second call - should use cache
			const result2 = await catalog.getCatalog();
			expect(result2).toEqual({ lodash: "^4.17.21" });
			expect(vi.mocked(readFile)).not.toHaveBeenCalled();
		});

		it("should invalidate cache when file mtime changes", async () => {
			vi.mocked(getWorkspaceRoot).mockReturnValue("/test/workspace");

			// First call with initial mtime
			vi.mocked(stat).mockResolvedValue(createMockStats(new Date(111111111)));
			vi.mocked(readFile).mockResolvedValue(`
catalog:
  axios: '^1.5.0'
`);

			const result1 = await catalog.getCatalog();
			expect(result1).toEqual({ axios: "^1.5.0" });

			// Second call with different mtime
			vi.mocked(stat).mockResolvedValue(createMockStats(new Date(222222222)));
			vi.mocked(readFile).mockResolvedValue(`
catalog:
  axios: '^1.6.0'
`);

			const result2 = await catalog.getCatalog();
			expect(result2).toEqual({ axios: "^1.6.0" });
		});

		it("should handle non-Error thrown objects", async () => {
			vi.mocked(getWorkspaceRoot).mockReturnValue("/test/workspace");
			vi.mocked(stat).mockRejectedValue("string error");

			const result = await catalog.getCatalog();

			expect(result).toEqual({});
		});
	});

	describe("clearCache", () => {
		it("should clear the cached catalog", async () => {
			vi.mocked(getWorkspaceRoot).mockReturnValue("/test/workspace");
			vi.mocked(stat).mockResolvedValue(createMockStats(new Date(123456789)));
			vi.mocked(readFile).mockResolvedValue(`
catalog:
  express: '^4.18.0'
`);

			// First call populates cache
			await catalog.getCatalog();

			// Clear cache
			catalog.clearCache();

			// Update mock to return different data
			vi.mocked(readFile).mockResolvedValue(`
catalog:
  express: '^4.19.0'
`);

			// Should read from file again
			const result = await catalog.getCatalog();
			expect(result).toEqual({ express: "^4.19.0" });
		});
	});

	describe("resolvePackageJson", () => {
		beforeEach(() => {
			vi.mocked(getWorkspaceRoot).mockReturnValue("/test/workspace");
			vi.mocked(stat).mockResolvedValue(createMockStats(new Date(123456789)));
			vi.mocked(readFile).mockResolvedValue(`
catalog:
  react: '^18.2.0'
  typescript: '^5.0.0'
`);
		});

		it("should resolve catalog: dependencies", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				dependencies: {
					react: "catalog:",
				},
			};

			const resolvedPkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				dependencies: {
					react: "^18.2.0",
				},
			};

			vi.mocked(createExportableManifest).mockResolvedValue(resolvedPkg as never);

			const result = await catalog.resolvePackageJson(pkg);

			expect(result).toEqual(resolvedPkg);
			expect(createExportableManifest).toHaveBeenCalledWith(process.cwd(), pkg, {
				catalogs: { default: { react: "^18.2.0", typescript: "^5.0.0" } },
			});
		});

		it("should resolve workspace: dependencies", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				dependencies: {
					"@my/lib": "workspace:*",
				},
			};

			const resolvedPkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				dependencies: {
					"@my/lib": "^1.0.0",
				},
			};

			vi.mocked(createExportableManifest).mockResolvedValue(resolvedPkg as never);

			const result = await catalog.resolvePackageJson(pkg);

			expect(result).toEqual(resolvedPkg);
		});

		it("should use custom directory when provided", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
			};

			vi.mocked(createExportableManifest).mockResolvedValue(pkg as never);

			await catalog.resolvePackageJson(pkg, "/custom/dir");

			expect(createExportableManifest).toHaveBeenCalledWith("/custom/dir", pkg, expect.any(Object));
		});

		it("should throw error when catalog: deps exist but catalog is empty", async () => {
			vi.mocked(readFile).mockResolvedValue(`
packages:
  - 'packages/*'
`);
			catalog.clearCache();

			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				dependencies: {
					react: "catalog:",
				},
			};

			await expect(catalog.resolvePackageJson(pkg)).rejects.toThrow(
				"Package contains catalog: dependencies but catalog configuration is missing",
			);
		});

		it("should throw error when unresolved catalog: references remain", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				dependencies: {
					react: "catalog:",
				},
			};

			// Return package with unresolved reference
			vi.mocked(createExportableManifest).mockResolvedValue(pkg as never);

			await expect(catalog.resolvePackageJson(pkg)).rejects.toThrow(
				"Transformation failed: unresolved catalog: references remain in package.json",
			);
		});

		it("should throw error when unresolved workspace: references remain", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				dependencies: {
					"@my/lib": "workspace:*",
				},
			};

			// Return package with unresolved reference
			vi.mocked(createExportableManifest).mockResolvedValue(pkg as never);

			await expect(catalog.resolvePackageJson(pkg)).rejects.toThrow(
				"Transformation failed: unresolved workspace: references remain in package.json",
			);
		});

		it("should collect dependencies from all dependency fields", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				dependencies: {
					react: "catalog:",
				},
				devDependencies: {
					typescript: "catalog:",
				},
				peerDependencies: {
					"react-dom": "catalog:react",
				},
				optionalDependencies: {
					fsevents: "workspace:*",
				},
			};

			const resolvedPkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				dependencies: {
					react: "^18.2.0",
				},
				devDependencies: {
					typescript: "^5.0.0",
				},
				peerDependencies: {
					"react-dom": "^18.2.0",
				},
				optionalDependencies: {
					fsevents: "^2.3.0",
				},
			};

			vi.mocked(createExportableManifest).mockResolvedValue(resolvedPkg as never);

			const result = await catalog.resolvePackageJson(pkg);

			expect(result).toEqual(resolvedPkg);
		});

		it("should re-throw validation errors", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				dependencies: {
					react: "catalog:",
				},
			};

			vi.mocked(createExportableManifest).mockRejectedValue(new Error("Transformation failed: some validation error"));

			await expect(catalog.resolvePackageJson(pkg)).rejects.toThrow("Transformation failed: some validation error");
		});

		it("should throw catalog resolution error when error contains 'catalog'", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
			};

			vi.mocked(createExportableManifest).mockRejectedValue(new Error("catalog reference not found"));

			await expect(catalog.resolvePackageJson(pkg)).rejects.toThrow("Catalog resolution failed");
		});

		it("should throw workspace resolution error when error contains 'workspace'", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
			};

			vi.mocked(createExportableManifest).mockRejectedValue(new Error("workspace package not found"));

			await expect(catalog.resolvePackageJson(pkg)).rejects.toThrow("Workspace resolution failed");
		});

		it("should throw manifest processing error when error contains 'manifest'", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
			};

			vi.mocked(createExportableManifest).mockRejectedValue(new Error("Invalid manifest format"));

			await expect(catalog.resolvePackageJson(pkg)).rejects.toThrow("Manifest processing failed");
		});

		it("should throw generic PNPM transformation error for unknown errors", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
			};

			vi.mocked(createExportableManifest).mockRejectedValue(new Error("Unknown error occurred"));

			await expect(catalog.resolvePackageJson(pkg)).rejects.toThrow(
				"PNPM transformation failed: Unknown error occurred",
			);
		});

		it("should handle non-Error thrown objects in resolvePackageJson", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
			};

			vi.mocked(createExportableManifest).mockRejectedValue("string error thrown");

			await expect(catalog.resolvePackageJson(pkg)).rejects.toThrow("PNPM transformation failed: string error thrown");
		});

		it("should pass through packages without catalog or workspace references", async () => {
			const pkg: PackageJson = {
				name: "test",
				version: "1.0.0",
				dependencies: {
					lodash: "^4.17.21",
				},
			};

			vi.mocked(createExportableManifest).mockResolvedValue(pkg as never);

			const result = await catalog.resolvePackageJson(pkg);

			expect(result).toEqual(pkg);
		});
	});

	describe("instance isolation", () => {
		it("should maintain separate caches for different instances", async () => {
			const catalog1 = new PnpmCatalog();
			const catalog2 = new PnpmCatalog();

			vi.mocked(getWorkspaceRoot).mockReturnValue("/test/workspace");
			vi.mocked(stat).mockResolvedValue(createMockStats(new Date(123456789)));
			vi.mocked(readFile).mockResolvedValue(`
catalog:
  lodash: '^4.17.21'
`);

			// Populate catalog1's cache
			await catalog1.getCatalog();

			// Clear only catalog1's cache
			catalog1.clearCache();

			// Update mock
			vi.mocked(readFile).mockResolvedValue(`
catalog:
  lodash: '^4.18.0'
`);

			// catalog1 should read new data
			const result1 = await catalog1.getCatalog();
			expect(result1).toEqual({ lodash: "^4.18.0" });

			// catalog2 should also read (it has its own empty cache)
			const result2 = await catalog2.getCatalog();
			expect(result2).toEqual({ lodash: "^4.18.0" });
		});
	});
});
