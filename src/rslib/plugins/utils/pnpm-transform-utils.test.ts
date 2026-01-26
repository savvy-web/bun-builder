import type { PackageJson } from "type-fest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the pnpm-catalog module
vi.mock("./pnpm-catalog.js");

import { applyPnpmTransformations } from "./package-json-transformer.js";
import type { PnpmCatalog } from "./pnpm-catalog.js";
import { getDefaultPnpmCatalog } from "./pnpm-catalog.js";

describe("pnpm-transform-utils", () => {
	let mockPnpmCatalog: {
		resolvePackageJson: ReturnType<typeof vi.fn>;
	};

	beforeEach(() => {
		vi.clearAllMocks();

		// Create a mock PnpmCatalog instance
		mockPnpmCatalog = {
			resolvePackageJson: vi.fn(),
		};

		// Mock getDefaultPnpmCatalog to return our mock instance
		vi.mocked(getDefaultPnpmCatalog).mockReturnValue(mockPnpmCatalog as unknown as PnpmCatalog);
	});

	describe("applyPnpmTransformations", () => {
		it("should delegate to PnpmCatalog.resolvePackageJson", async () => {
			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					react: "catalog:react",
				},
			};

			const expectedOutput: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					react: "^18.2.0",
				},
			};

			mockPnpmCatalog.resolvePackageJson.mockResolvedValue(expectedOutput);

			const result = await applyPnpmTransformations(inputPackageJson);

			expect(result).toEqual(expectedOutput);
			expect(getDefaultPnpmCatalog).toHaveBeenCalledOnce();
			expect(mockPnpmCatalog.resolvePackageJson).toHaveBeenCalledWith(inputPackageJson, process.cwd());
		});

		it("should pass custom directory to PnpmCatalog.resolvePackageJson", async () => {
			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
			};

			mockPnpmCatalog.resolvePackageJson.mockResolvedValue(inputPackageJson);

			const customDir = "/custom/path";
			await applyPnpmTransformations(inputPackageJson, customDir);

			expect(mockPnpmCatalog.resolvePackageJson).toHaveBeenCalledWith(inputPackageJson, customDir);
		});

		it("should propagate errors from PnpmCatalog.resolvePackageJson", async () => {
			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
				dependencies: {
					react: "catalog:react",
				},
			};

			mockPnpmCatalog.resolvePackageJson.mockRejectedValue(
				new Error("Package contains catalog: dependencies but catalog configuration is missing"),
			);

			await expect(applyPnpmTransformations(inputPackageJson)).rejects.toThrow(
				"Package contains catalog: dependencies but catalog configuration is missing",
			);
		});

		it("should propagate catalog resolution errors", async () => {
			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
			};

			mockPnpmCatalog.resolvePackageJson.mockRejectedValue(new Error("Catalog resolution failed"));

			await expect(applyPnpmTransformations(inputPackageJson)).rejects.toThrow("Catalog resolution failed");
		});

		it("should propagate workspace resolution errors", async () => {
			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
			};

			mockPnpmCatalog.resolvePackageJson.mockRejectedValue(new Error("Workspace resolution failed"));

			await expect(applyPnpmTransformations(inputPackageJson)).rejects.toThrow("Workspace resolution failed");
		});

		it("should propagate unresolved reference errors", async () => {
			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
			};

			mockPnpmCatalog.resolvePackageJson.mockRejectedValue(
				new Error("Transformation failed: unresolved catalog: references remain in package.json"),
			);

			await expect(applyPnpmTransformations(inputPackageJson)).rejects.toThrow(
				"Transformation failed: unresolved catalog: references remain in package.json",
			);
		});

		it("should use default directory when not provided", async () => {
			const inputPackageJson: PackageJson = {
				name: "test-package",
				version: "1.0.0",
			};

			mockPnpmCatalog.resolvePackageJson.mockResolvedValue(inputPackageJson);

			await applyPnpmTransformations(inputPackageJson);

			expect(mockPnpmCatalog.resolvePackageJson).toHaveBeenCalledWith(inputPackageJson, process.cwd());
		});
	});
});
