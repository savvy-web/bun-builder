import { describe, expect, it, vi } from "vitest";

// Mock helpers to suppress log output during tests
vi.mock("./utils/build-logger.js", () => ({
	createEnvLogger: () => ({
		fileOp: vi.fn(),
		error: vi.fn(),
	}),
}));

// Mock asset utilities
vi.mock("./utils/asset-utils.js");

// Static imports after mocks are set up
import { FilesArrayPlugin } from "./files-array-plugin.js";
import { JsonAsset, TextAsset } from "./utils/asset-utils.js";

const mockJsonAssetCreate: ReturnType<typeof vi.mocked<typeof JsonAsset.create>> = vi.mocked(JsonAsset.create);
const mockTextAssetCreate: ReturnType<typeof vi.mocked<typeof TextAsset.create>> = vi.mocked(TextAsset.create);

describe("FilesArrayPlugin", () => {
	it("should create plugin with correct name", () => {
		const plugin = FilesArrayPlugin();
		expect(plugin.name).toBe("files-array-plugin");
		expect(typeof plugin.setup).toBe("function");
	});

	it("should setup plugin with processAssets hooks", () => {
		const plugin = FilesArrayPlugin();
		const mockApi = {
			processAssets: vi.fn(),
			useExposed: vi.fn(),
			expose: vi.fn(),
		};

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof FilesArrayPlugin>["setup"]>[0]);

		// Should register processAssets hook twice
		expect(mockApi.processAssets).toHaveBeenCalledTimes(2);
		expect(mockApi.processAssets.mock.calls[0][0]).toEqual({ stage: "additional" });
		expect(mockApi.processAssets.mock.calls[1][0]).toEqual({ stage: "optimize-inline" });
	});

	it("should handle missing package.json asset gracefully in first stage", async () => {
		const plugin = FilesArrayPlugin();
		const mockApi = {
			processAssets: vi.fn(),
			useExposed: vi.fn().mockReturnValue(undefined),
			expose: vi.fn(),
		};

		// Mock JsonAsset.create to return null (missing package.json)
		mockJsonAssetCreate.mockResolvedValue(null);
		mockTextAssetCreate.mockResolvedValue(null);

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof FilesArrayPlugin>["setup"]>[0]);

		// Get the first callback function (additional stage)
		const callback = mockApi.processAssets.mock.calls[0][1];

		// Mock context without package.json asset
		const mockContext = {
			compilation: {
				name: "test-env",
				assets: {},
			},
		};

		// Should not throw and should return early
		await expect(callback(mockContext)).resolves.toBeUndefined();
	});

	it("should handle missing package.json asset gracefully in second stage", async () => {
		const plugin = FilesArrayPlugin();
		const mockApi = {
			processAssets: vi.fn(),
			useExposed: vi.fn().mockReturnValue(undefined),
			expose: vi.fn(),
		};

		// Mock JsonAsset.create to return null (missing package.json)
		mockJsonAssetCreate.mockResolvedValue(null);
		mockTextAssetCreate.mockResolvedValue(null);

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof FilesArrayPlugin>["setup"]>[0]);

		// Get the second callback function (optimize-inline stage)
		const callback = mockApi.processAssets.mock.calls[1][1];

		// Mock context without package.json asset
		const mockContext = {
			compilation: {
				name: "test-env",
				assets: {},
			},
		};

		// Should not throw and should return early
		await expect(callback(mockContext)).resolves.toBeUndefined();
	});

	it("should add essential files to shared files array", async () => {
		const plugin = FilesArrayPlugin();
		const mockApi = {
			processAssets: vi.fn(),
			useExposed: vi.fn().mockReturnValue(undefined),
			expose: vi.fn(),
		};

		// Mock asset creation for essential files
		// biome-ignore lint/suspicious/noExplicitAny: Test mocks
		const mockPackageJsonAsset = { fileName: "package.json" } as any;
		// biome-ignore lint/suspicious/noExplicitAny: Test mocks
		const mockReadmeAsset = { fileName: "README.md" } as any;
		// biome-ignore lint/suspicious/noExplicitAny: Test mocks
		const mockLicenseAsset = { fileName: "LICENSE" } as any;

		mockJsonAssetCreate.mockResolvedValue(mockPackageJsonAsset);
		mockTextAssetCreate.mockResolvedValueOnce(mockReadmeAsset).mockResolvedValueOnce(mockLicenseAsset);

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof FilesArrayPlugin>["setup"]>[0]);

		// Get the first callback function (additional stage)
		const callback = mockApi.processAssets.mock.calls[0][1];

		const mockContext = {
			compilation: {
				name: "test-env",
				assets: {
					"package.json": { source: () => '{"name": "test"}' },
					"README.md": { source: () => "# README" },
					LICENSE: { source: () => "MIT License" },
					"index.js": { source: () => "// JS file" },
				},
			},
		};

		await callback(mockContext);

		// Should have called expose to create shared files array
		expect(mockApi.expose).toHaveBeenCalledWith("files-array", expect.any(Set));
	});

	it("should update package.json with files array in second stage", async () => {
		const plugin = FilesArrayPlugin();

		// Create a mock files array that would be populated by the first stage
		const mockFilesArray = new Set(["package.json", "README.md", "LICENSE", "index.js"]);

		const mockApi = {
			processAssets: vi.fn(),
			useExposed: vi.fn().mockReturnValue(mockFilesArray),
			expose: vi.fn(),
			onAfterBuild: vi.fn(),
		};

		// Mock package.json asset
		const mockPackageJsonAsset = {
			fileName: "package.json",
			data: {
				name: "test-package",
				version: "1.0.0",
				files: [],
			},
			update: vi.fn(),
			// biome-ignore lint/suspicious/noExplicitAny: Test mocks
		} as any;

		mockJsonAssetCreate.mockResolvedValue(mockPackageJsonAsset);

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof FilesArrayPlugin>["setup"]>[0]);

		// Get the second callback function (optimize-inline stage)
		const callback = mockApi.processAssets.mock.calls[1][1];

		const mockContext = {
			compilation: {
				name: "test-env",
				assets: {},
			},
		};

		await callback(mockContext);

		// Should have updated package.json data
		expect(mockPackageJsonAsset.data.files).toEqual(["LICENSE", "README.md", "index.js", "package.json"]);

		// Should have called update on the package.json asset
		expect(mockPackageJsonAsset.update).toHaveBeenCalledTimes(1);
	});

	it("should preserve existing files in package.json", async () => {
		const plugin = FilesArrayPlugin();

		// Create a mock files array with additional files
		const mockFilesArray = new Set(["package.json", "new-file.js"]);

		const mockApi = {
			processAssets: vi.fn(),
			useExposed: vi.fn().mockReturnValue(mockFilesArray),
			expose: vi.fn(),
			onAfterBuild: vi.fn(),
		};

		// Mock package.json asset with existing files
		const mockPackageJsonAsset = {
			fileName: "package.json",
			data: {
				name: "test-package",
				version: "1.0.0",
				files: ["existing-file.js", "package.json"],
			},
			update: vi.fn(),
			// biome-ignore lint/suspicious/noExplicitAny: Test mocks
		} as any;

		mockJsonAssetCreate.mockResolvedValue(mockPackageJsonAsset);

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof FilesArrayPlugin>["setup"]>[0]);

		// Get the second callback function (optimize-inline stage)
		const callback = mockApi.processAssets.mock.calls[1][1];

		const mockContext = {
			compilation: {
				name: "test-env",
				assets: {},
			},
		};

		await callback(mockContext);

		// Should have merged existing and new files, sorted
		expect(mockPackageJsonAsset.data.files).toEqual(["existing-file.js", "new-file.js", "package.json"]);

		// Should have called update on the package.json asset
		expect(mockPackageJsonAsset.update).toHaveBeenCalledTimes(1);
	});

	it("should handle empty files array gracefully", async () => {
		const plugin = FilesArrayPlugin();

		// Create an empty mock files array
		const mockFilesArray = new Set<string>();

		const mockApi = {
			processAssets: vi.fn(),
			useExposed: vi.fn().mockReturnValue(mockFilesArray),
			expose: vi.fn(),
			onAfterBuild: vi.fn(),
		};

		// Mock package.json asset with no files
		const mockPackageJsonAsset = {
			fileName: "package.json",
			data: {
				name: "test-package",
				version: "1.0.0",
				files: [] as string[],
			},
			update: vi.fn(),
			// biome-ignore lint/suspicious/noExplicitAny: Test mocks
		} as any;

		mockJsonAssetCreate.mockResolvedValue(mockPackageJsonAsset);

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof FilesArrayPlugin>["setup"]>[0]);

		// Get the second callback function (optimize-inline stage)
		const callback = mockApi.processAssets.mock.calls[1][1];

		const mockContext = {
			compilation: {
				name: "test-env",
				assets: {},
			},
		};

		await callback(mockContext);

		// Should have empty files array when no files
		expect(mockPackageJsonAsset.data.files).toEqual([]);

		// Should have called update on the package.json asset
		expect(mockPackageJsonAsset.update).toHaveBeenCalledTimes(1);
	});

	it("should use compilation.options.name when compilation.name is not available", async () => {
		const plugin = FilesArrayPlugin();

		// Create a mock files array that would be populated by the first stage
		const mockFilesArray = new Set(["package.json", "README.md"]);

		const mockApi = {
			processAssets: vi.fn(),
			useExposed: vi.fn().mockReturnValue(mockFilesArray),
			expose: vi.fn(),
			onAfterBuild: vi.fn(),
		};

		// Mock package.json asset
		const mockPackageJsonAsset = {
			fileName: "package.json",
			data: {
				name: "test-package",
				version: "1.0.0",
				files: [],
			},
			update: vi.fn(),
			// biome-ignore lint/suspicious/noExplicitAny: Test mocks
		} as any;

		mockJsonAssetCreate.mockResolvedValue(mockPackageJsonAsset);

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof FilesArrayPlugin>["setup"]>[0]);

		// Get the second callback function (optimize-inline stage)
		const callback = mockApi.processAssets.mock.calls[1][1];

		const mockContext = {
			compilation: {
				// No name property, but has options.name
				options: {
					name: "test-env-from-options",
				},
				assets: {},
			},
		};

		await callback(mockContext);

		// Should have updated package.json data
		expect(mockPackageJsonAsset.data.files).toEqual(["README.md", "package.json"]);

		// Should have called update on the package.json asset
		expect(mockPackageJsonAsset.update).toHaveBeenCalledTimes(1);
	});

	it("should handle package.json with undefined files array", async () => {
		const plugin = FilesArrayPlugin();

		// Create a mock files array with some files
		const mockFilesArray = new Set(["package.json", "README.md", "index.js"]);

		const mockApi = {
			processAssets: vi.fn(),
			useExposed: vi.fn().mockReturnValue(mockFilesArray),
			expose: vi.fn(),
			onAfterBuild: vi.fn(),
		};

		// Mock package.json asset with undefined files
		const mockPackageJsonAsset = {
			fileName: "package.json",
			data: {
				name: "test-package",
				version: "1.0.0",
				// No files property (undefined)
			},
			update: vi.fn(),
			// biome-ignore lint/suspicious/noExplicitAny: Test mocks
		} as any;

		mockJsonAssetCreate.mockResolvedValue(mockPackageJsonAsset);

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof FilesArrayPlugin>["setup"]>[0]);

		// Get the second callback function (optimize-inline stage)
		const callback = mockApi.processAssets.mock.calls[1][1];

		const mockContext = {
			compilation: {
				name: "test-env",
				assets: {},
			},
		};

		await callback(mockContext);

		// Should have set files array with all files from filesArray
		expect(mockPackageJsonAsset.data.files).toEqual(["README.md", "index.js", "package.json"]);

		// Should have called update on the package.json asset
		expect(mockPackageJsonAsset.update).toHaveBeenCalledTimes(1);
	});

	it("should handle missing compilation name and fallback to unknown", async () => {
		const plugin = FilesArrayPlugin();

		const mockFilesArray = new Set(["package.json"]);

		const mockApi = {
			processAssets: vi.fn(),
			useExposed: vi.fn().mockReturnValue(mockFilesArray),
			expose: vi.fn(),
			onAfterBuild: vi.fn(),
		};

		const mockPackageJsonAsset = {
			fileName: "package.json",
			data: {
				name: "test-package",
				version: "1.0.0",
				files: [],
			},
			update: vi.fn(),
			// biome-ignore lint/suspicious/noExplicitAny: Test mocks
		} as any;

		mockJsonAssetCreate.mockResolvedValue(mockPackageJsonAsset);

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof FilesArrayPlugin>["setup"]>[0]);

		const callback = mockApi.processAssets.mock.calls[1][1];

		// Mock context with no compilation name
		const mockContext = {
			compilation: {
				// No name or options property
				assets: {},
			},
		};

		await callback(mockContext);

		// Should still work and update package.json
		expect(mockPackageJsonAsset.data.files).toEqual(["package.json"]);
		expect(mockPackageJsonAsset.update).toHaveBeenCalledTimes(1);
	});

	it("should create files array if not exposed in first processAssets call", async () => {
		const plugin = FilesArrayPlugin();

		const mockApi = {
			processAssets: vi.fn(),
			useExposed: vi.fn().mockReturnValue(undefined), // Not exposed yet
			expose: vi.fn(),
			onAfterBuild: vi.fn(),
		};

		// Mock asset creation for first stage
		// biome-ignore lint/suspicious/noExplicitAny: Test mocks
		const mockPackageJsonAsset = { fileName: "package.json" } as any;
		// biome-ignore lint/suspicious/noExplicitAny: Test mocks
		const mockReadmeAsset = { fileName: "README.md" } as any;
		// biome-ignore lint/suspicious/noExplicitAny: Test mocks
		const mockLicenseAsset = null as any; // LICENSE doesn't exist

		mockJsonAssetCreate.mockResolvedValue(mockPackageJsonAsset);
		mockTextAssetCreate.mockResolvedValueOnce(mockReadmeAsset).mockResolvedValueOnce(mockLicenseAsset); // LICENSE returns null

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof FilesArrayPlugin>["setup"]>[0]);

		// Get the first callback function (additional stage)
		const firstCallback = mockApi.processAssets.mock.calls[0][1];

		const mockContext = {
			compilation: {
				name: "test-env",
				assets: {
					"package.json": { source: () => '{"name": "test"}' },
					"README.md": { source: () => "# README" },
					// No LICENSE file
				},
			},
		};

		await firstCallback(mockContext);

		// Should have called expose to create shared files array
		expect(mockApi.expose).toHaveBeenCalledWith("files-array", expect.any(Set));

		// Check the Set was created with correct files (no LICENSE since it returned null)
		const exposedSet = mockApi.expose.mock.calls[0][1] as Set<string>;
		expect(Array.from(exposedSet).sort()).toEqual(["README.md", "package.json"]);
	});

	it("should create files array if not exposed in second processAssets call", async () => {
		const plugin = FilesArrayPlugin();

		const mockApi = {
			processAssets: vi.fn(),
			useExposed: vi.fn().mockReturnValue(undefined), // Not exposed yet
			expose: vi.fn(),
			onAfterBuild: vi.fn(),
		};

		const mockPackageJsonAsset = {
			fileName: "package.json",
			data: {
				name: "test-package",
				version: "1.0.0",
				files: ["existing.js"],
			},
			update: vi.fn(),
			// biome-ignore lint/suspicious/noExplicitAny: Test mocks
		} as any;

		mockJsonAssetCreate.mockResolvedValue(mockPackageJsonAsset);

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof FilesArrayPlugin>["setup"]>[0]);

		// Get the second callback function (optimize-inline stage)
		const callback = mockApi.processAssets.mock.calls[1][1];

		const mockContext = {
			compilation: {
				name: "test-env",
				assets: {},
			},
		};

		await callback(mockContext);

		// Should have called expose to create a new files array
		expect(mockApi.expose).toHaveBeenCalledWith("files-array", expect.any(Set));

		// Should preserve existing files even with empty filesArray
		expect(mockPackageJsonAsset.data.files).toEqual(["existing.js"]);
		expect(mockPackageJsonAsset.update).toHaveBeenCalledTimes(1);
	});
});
