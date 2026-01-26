import type { PackageJson } from "type-fest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockAssetRegistry } from "../../__test__/rslib/types/test-types.js";

// Mock node:fs/promises
vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
	stat: vi.fn(),
}));

// Mock dependencies
vi.mock("./utils/file-utils.js");
vi.mock("./utils/package-json-transformer.js");
vi.mock("./utils/asset-utils.js");

import { PackageJsonTransformPlugin } from "./package-json-transform-plugin.js";
import { JsonAsset, TextAsset } from "./utils/asset-utils.js";
// Static imports after mocks are set up
import { buildPackageJson } from "./utils/package-json-transformer.js";

const mockBuildPackageJson: ReturnType<typeof vi.mocked<typeof buildPackageJson>> = vi.mocked(buildPackageJson);
const mockJsonAssetCreate: ReturnType<typeof vi.mocked<typeof JsonAsset.create>> = vi.mocked(JsonAsset.create);
const mockTextAssetCreate: ReturnType<typeof vi.mocked<typeof TextAsset.create>> = vi.mocked(TextAsset.create);

interface MockContext {
	assets: MockAssetRegistry;
	sources: {
		RawSource: ReturnType<typeof vi.fn>;
	};
	compilation: {
		emitAsset: ReturnType<typeof vi.fn>;
		updateAsset: ReturnType<typeof vi.fn>;
		name: string | undefined;
	};
	_mocks: {
		RawSource: ReturnType<typeof vi.fn>;
		emitAsset: ReturnType<typeof vi.fn>;
		updateAsset: ReturnType<typeof vi.fn>;
	};
}

// Helper to create proper webpack-style context mock
function createMockContext(assets: MockAssetRegistry = {}): MockContext {
	const mockRawSource = vi.fn().mockImplementation((content: string) => ({
		source: () => content,
	}));
	const mockEmitAsset = vi.fn();
	const mockUpdateAsset = vi.fn();

	return {
		assets,
		sources: {
			RawSource: mockRawSource,
		},
		compilation: {
			emitAsset: mockEmitAsset,
			updateAsset: mockUpdateAsset,
			name: "production" as string | undefined, // Default to production, but optional
		},
		// Add mocked methods for easy access in tests
		_mocks: {
			RawSource: mockRawSource,
			emitAsset: mockEmitAsset,
			updateAsset: mockUpdateAsset,
		},
	};
}

describe("PackageJsonTransformPlugin", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset specific mocks
		mockJsonAssetCreate.mockClear();
		mockTextAssetCreate.mockClear();
		mockBuildPackageJson.mockClear();
	});

	it("should create plugin with correct name", () => {
		const plugin = PackageJsonTransformPlugin();
		expect(plugin.name).toBe("package-json-processor");
		expect(typeof plugin.setup).toBe("function");
	});

	it("should setup plugin with processAssets hooks", () => {
		const plugin = PackageJsonTransformPlugin();
		const mockApi = {
			processAssets: vi.fn(),
			expose: vi.fn(),
			useExposed: vi.fn().mockReturnValue(undefined),
		};

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof PackageJsonTransformPlugin>["setup"]>[0]);

		// Should register 3 processAssets hooks
		expect(mockApi.processAssets).toHaveBeenCalledTimes(3);
		// Should expose the files-cache
		expect(mockApi.expose).toHaveBeenCalledWith("files-cache", expect.any(Map));

		// Check the stages
		const calls = mockApi.processAssets.mock.calls;
		expect(calls[0][0]).toEqual({ stage: "pre-process" }); // files creation
		expect(calls[1][0]).toEqual({ stage: "optimize" }); // transform package.json
		expect(calls[2][0]).toEqual({ stage: "optimize-inline" }); // name override
	});

	it("should transform package.json during optimize stage", async () => {
		const plugin = PackageJsonTransformPlugin();
		const mockApi = { processAssets: vi.fn(), expose: vi.fn(), useExposed: vi.fn().mockReturnValue(undefined) };

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof PackageJsonTransformPlugin>["setup"]>[0]);

		// Get the second callback (package.json transformer)
		const callback = mockApi.processAssets.mock.calls[1][1];

		const originalPackageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
		};

		const transformedPackageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
			private: false,
		};

		// Mock JsonAsset
		const mockPackageJsonAsset = {
			data: originalPackageJson,
			update: vi.fn(),
		};
		// biome-ignore lint/suspicious/noExplicitAny: Mock object for testing
		mockJsonAssetCreate.mockResolvedValue(mockPackageJsonAsset as any);

		const mockContext = createMockContext();
		mockBuildPackageJson.mockResolvedValue(transformedPackageJson);

		await callback(mockContext);

		expect(mockJsonAssetCreate).toHaveBeenCalledWith(mockContext, "package.json", true);
		expect(mockBuildPackageJson).toHaveBeenCalledWith(
			originalPackageJson,
			true,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
		);
		expect(mockPackageJsonAsset.update).toHaveBeenCalled();
	});

	it("should handle dev environment", async () => {
		const plugin = PackageJsonTransformPlugin();
		const mockApi = { processAssets: vi.fn(), expose: vi.fn(), useExposed: vi.fn().mockReturnValue(undefined) };

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof PackageJsonTransformPlugin>["setup"]>[0]);

		const callback = mockApi.processAssets.mock.calls[1][1];

		const originalPackageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
		};

		// Mock JsonAsset
		const mockPackageJsonAsset = {
			data: originalPackageJson,
			update: vi.fn(),
		};
		// biome-ignore lint/suspicious/noExplicitAny: Mock object for testing
		mockJsonAssetCreate.mockResolvedValue(mockPackageJsonAsset as any);

		mockBuildPackageJson.mockResolvedValue(originalPackageJson);

		const mockContext = createMockContext();
		mockContext.compilation.name = "dev"; // Dev environment - only "dev" is treated as development

		await callback(mockContext);

		expect(mockBuildPackageJson).toHaveBeenCalledWith(
			originalPackageJson,
			false,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
		);
	});

	it("should handle missing compilation name", async () => {
		const plugin = PackageJsonTransformPlugin();
		const mockApi = { processAssets: vi.fn(), expose: vi.fn(), useExposed: vi.fn().mockReturnValue(undefined) };

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof PackageJsonTransformPlugin>["setup"]>[0]);

		const callback = mockApi.processAssets.mock.calls[1][1];

		const originalPackageJson: PackageJson = {
			name: "test-package",
			version: "1.0.0",
		};

		// Mock JsonAsset
		const mockPackageJsonAsset = {
			data: originalPackageJson,
			update: vi.fn(),
		};
		// biome-ignore lint/suspicious/noExplicitAny: Mock object for testing
		mockJsonAssetCreate.mockResolvedValue(mockPackageJsonAsset as any);

		mockBuildPackageJson.mockResolvedValue(originalPackageJson);

		const mockContext = createMockContext();
		delete mockContext.compilation.name; // No name property - should default to unknown

		await callback(mockContext);

		// Should default to production mode when name is missing (isProduction = true)
		expect(mockBuildPackageJson).toHaveBeenCalledWith(
			originalPackageJson,
			true,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
		);
	});

	it("should skip transformation when package.json asset doesn't exist", async () => {
		const plugin = PackageJsonTransformPlugin();
		const mockApi = { processAssets: vi.fn(), expose: vi.fn(), useExposed: vi.fn().mockReturnValue(undefined) };

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof PackageJsonTransformPlugin>["setup"]>[0]);

		const callback = mockApi.processAssets.mock.calls[1][1];

		// Mock JsonAsset.create to reject when package.json doesn't exist
		mockJsonAssetCreate.mockRejectedValue(new Error("Failed to load JSON asset: package.json. ENOENT: no such file"));

		const mockContext = createMockContext();

		// Should throw error and not call buildPackageJson
		await expect(callback(mockContext)).rejects.toThrow("Failed to load JSON asset");
		expect(mockBuildPackageJson).not.toHaveBeenCalled();
	});

	it("should skip transformation when package.json asset returns null", async () => {
		const plugin = PackageJsonTransformPlugin();
		const mockApi = { processAssets: vi.fn(), expose: vi.fn(), useExposed: vi.fn().mockReturnValue(undefined) };

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof PackageJsonTransformPlugin>["setup"]>[0]);

		const callback = mockApi.processAssets.mock.calls[1][1];

		// Mock JsonAsset.create to return null (asset not found but no error thrown)
		mockJsonAssetCreate.mockResolvedValue(null);

		const mockContext = createMockContext();

		// Should return early without calling buildPackageJson
		await callback(mockContext);
		expect(mockBuildPackageJson).not.toHaveBeenCalled();
	});

	it("should expose files-cache for sharing between asset processors", () => {
		const plugin = PackageJsonTransformPlugin();
		const mockApi = { processAssets: vi.fn(), expose: vi.fn(), useExposed: vi.fn().mockReturnValue(undefined) };

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof PackageJsonTransformPlugin>["setup"]>[0]);

		expect(mockApi.expose).toHaveBeenCalledWith("files-cache", expect.any(Map));
	});

	it("should use asset processor for file emission", async () => {
		const plugin = PackageJsonTransformPlugin();
		const mockApi = { processAssets: vi.fn(), expose: vi.fn(), useExposed: vi.fn().mockReturnValue(undefined) };

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof PackageJsonTransformPlugin>["setup"]>[0]);

		// Verify the correct stages are used
		const calls = mockApi.processAssets.mock.calls;

		// Should have 3 processAssets calls total
		expect(calls).toHaveLength(3);

		// First call for file creation
		expect(calls[0][0]).toEqual({ stage: "pre-process" });

		// Second call for package.json transformation
		expect(calls[1][0]).toEqual({ stage: "optimize" });

		// Third call for name override
		expect(calls[2][0]).toEqual({ stage: "optimize-inline" });
	});

	it("should handle caching by using shared cache instance", () => {
		const plugin1 = PackageJsonTransformPlugin();
		const plugin2 = PackageJsonTransformPlugin();

		const mockApi1 = { processAssets: vi.fn(), expose: vi.fn(), useExposed: vi.fn().mockReturnValue(undefined) };
		const mockApi2 = { processAssets: vi.fn(), expose: vi.fn(), useExposed: vi.fn().mockReturnValue(undefined) };

		plugin1.setup(mockApi1 as unknown as Parameters<ReturnType<typeof PackageJsonTransformPlugin>["setup"]>[0]);
		plugin2.setup(mockApi2 as unknown as Parameters<ReturnType<typeof PackageJsonTransformPlugin>["setup"]>[0]);

		// Each plugin instance should expose its own cache
		expect(mockApi1.expose).toHaveBeenCalledWith("files-cache", expect.any(Map));
		expect(mockApi2.expose).toHaveBeenCalledWith("files-cache", expect.any(Map));

		// The caches should be different instances for different plugin instances
		const cache1 = mockApi1.expose.mock.calls[0][1];
		const cache2 = mockApi2.expose.mock.calls[0][1];
		expect(cache1).not.toBe(cache2);
	});

	it("should execute pre-process stage callback to create assets", async () => {
		const plugin = PackageJsonTransformPlugin();
		const filesArray = new Set<string>();
		const mockApi = {
			processAssets: vi.fn(),
			expose: vi.fn(),
			useExposed: vi.fn().mockImplementation((key: string) => {
				if (key === "files-array") return filesArray;
				return undefined;
			}),
		};

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof PackageJsonTransformPlugin>["setup"]>[0]);

		// Mock asset creation
		const mockPackageJsonAsset = { fileName: "package.json" };
		const mockReadmeAsset = { fileName: "README.md" };
		const mockLicenseAsset = { fileName: "LICENSE" };

		// biome-ignore lint/suspicious/noExplicitAny: Mock object for testing
		mockJsonAssetCreate.mockResolvedValue(mockPackageJsonAsset as any);
		// biome-ignore lint/suspicious/noExplicitAny: Mock object for testing
		mockTextAssetCreate.mockResolvedValueOnce(mockReadmeAsset as any);
		// biome-ignore lint/suspicious/noExplicitAny: Mock object for testing
		mockTextAssetCreate.mockResolvedValueOnce(mockLicenseAsset as any);

		// Get the pre-process callback
		const preProcessCallback = mockApi.processAssets.mock.calls[0][1];

		// Mock the context
		const mockContext = createMockContext();

		// Execute the callback
		await preProcessCallback(mockContext);

		// Should have called create methods for all assets
		expect(mockJsonAssetCreate).toHaveBeenCalledWith(mockContext, "package.json", true);
		expect(mockTextAssetCreate).toHaveBeenCalledWith(mockContext, "README.md", false);
		expect(mockTextAssetCreate).toHaveBeenCalledWith(mockContext, "LICENSE", false);

		// Should have added files to the shared files array
		expect(filesArray.has("package.json")).toBe(true);
		expect(filesArray.has("README.md")).toBe(true);
		expect(filesArray.has("LICENSE")).toBe(true);
	});

	it("should create files-array when it doesn't exist during pre-process", async () => {
		const plugin = PackageJsonTransformPlugin();
		let exposedFilesArray: Set<string> | undefined;
		const mockApi = {
			processAssets: vi.fn(),
			// biome-ignore lint/suspicious/noExplicitAny: Mock function parameter for testing
			expose: vi.fn().mockImplementation((key: string, value: any) => {
				if (key === "files-array") exposedFilesArray = value;
			}),
			useExposed: vi.fn().mockReturnValue(undefined), // No existing files array
		};

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof PackageJsonTransformPlugin>["setup"]>[0]);

		// Mock asset creation
		const mockPackageJsonAsset = { fileName: "package.json" };
		const mockReadmeAsset = { fileName: "README.md" };
		const mockLicenseAsset = { fileName: "LICENSE" };

		// biome-ignore lint/suspicious/noExplicitAny: Mock object for testing
		mockJsonAssetCreate.mockResolvedValue(mockPackageJsonAsset as any);
		// biome-ignore lint/suspicious/noExplicitAny: Mock object for testing
		mockTextAssetCreate.mockResolvedValueOnce(mockReadmeAsset as any);
		// biome-ignore lint/suspicious/noExplicitAny: Mock object for testing
		mockTextAssetCreate.mockResolvedValueOnce(mockLicenseAsset as any);

		// Get the pre-process callback
		const preProcessCallback = mockApi.processAssets.mock.calls[0][1];

		// Mock the context
		const mockContext = createMockContext();

		// Execute the callback
		await preProcessCallback(mockContext);

		// Should have created and exposed a new files array
		expect(mockApi.expose).toHaveBeenCalledWith("files-array", expect.any(Set));
		expect(exposedFilesArray).toBeInstanceOf(Set);
		expect(exposedFilesArray?.has("package.json")).toBe(true);
		expect(exposedFilesArray?.has("README.md")).toBe(true);
		expect(exposedFilesArray?.has("LICENSE")).toBe(true);
	});

	it("should execute name override during optimize-inline stage", async () => {
		const plugin = PackageJsonTransformPlugin({ name: "custom-package-name" });
		const mockApi = { processAssets: vi.fn(), expose: vi.fn(), useExposed: vi.fn().mockReturnValue(undefined) };

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof PackageJsonTransformPlugin>["setup"]>[0]);

		// Mock JsonAsset
		const mockPackageJsonAsset = {
			data: { name: "original-name", version: "1.0.0" },
			update: vi.fn(),
		};
		// biome-ignore lint/suspicious/noExplicitAny: Mock object for testing
		mockJsonAssetCreate.mockResolvedValue(mockPackageJsonAsset as any);

		// Get the optimize-inline callback (third one)
		const optimizeInlineCallback = mockApi.processAssets.mock.calls[2][1];

		const mockContext = createMockContext();

		// Execute the callback
		await optimizeInlineCallback(mockContext);

		// Should have created JsonAsset and updated the name
		expect(mockJsonAssetCreate).toHaveBeenCalledWith(mockContext, "package.json", true);
		expect(mockPackageJsonAsset.data.name).toBe("custom-package-name");
		expect(mockPackageJsonAsset.update).toHaveBeenCalled();
	});

	it("should skip name override when name option is true", async () => {
		const plugin = PackageJsonTransformPlugin({ name: true });
		const mockApi = { processAssets: vi.fn(), expose: vi.fn(), useExposed: vi.fn().mockReturnValue(undefined) };

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof PackageJsonTransformPlugin>["setup"]>[0]);

		// Get the optimize-inline callback
		const optimizeInlineCallback = mockApi.processAssets.mock.calls[2][1];

		const mockContext = createMockContext();

		// Execute the callback
		await optimizeInlineCallback(mockContext);

		// Should not have called JsonAsset.create since name is true (not a string)
		expect(mockJsonAssetCreate).not.toHaveBeenCalled();
	});

	it("should skip name override when name option is not provided", async () => {
		const plugin = PackageJsonTransformPlugin(); // No name option
		const mockApi = { processAssets: vi.fn(), expose: vi.fn(), useExposed: vi.fn().mockReturnValue(undefined) };

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof PackageJsonTransformPlugin>["setup"]>[0]);

		// Get the optimize-inline callback
		const optimizeInlineCallback = mockApi.processAssets.mock.calls[2][1];

		const mockContext = createMockContext();

		// Execute the callback
		await optimizeInlineCallback(mockContext);

		// Should not have called JsonAsset.create since no name option was provided
		expect(mockJsonAssetCreate).not.toHaveBeenCalled();
	});

	it("should handle processTSExports option in optimization", async () => {
		const plugin = PackageJsonTransformPlugin({ processTSExports: true });
		const mockApi = { processAssets: vi.fn(), expose: vi.fn(), useExposed: vi.fn().mockReturnValue(undefined) };

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof PackageJsonTransformPlugin>["setup"]>[0]);

		// Get the optimize callback
		const optimizeCallback = mockApi.processAssets.mock.calls[1][1];

		const originalPackageJson = { name: "test", version: "1.0.0" };

		// Mock JsonAsset
		const mockPackageJsonAsset = {
			data: originalPackageJson,
			update: vi.fn(),
		};
		// biome-ignore lint/suspicious/noExplicitAny: Mock object for testing
		mockJsonAssetCreate.mockResolvedValue(mockPackageJsonAsset as any);

		const transformedPackageJson = { name: "test", version: "1.0.0", private: false };
		mockBuildPackageJson.mockResolvedValue(transformedPackageJson);

		const mockContext = createMockContext();
		await optimizeCallback(mockContext);

		// Should have called buildPackageJson with processTSExports: true
		expect(mockBuildPackageJson).toHaveBeenCalledWith(
			originalPackageJson,
			true,
			true,
			undefined,
			undefined,
			undefined,
			undefined,
		);
	});

	it("should set private to true when forcePrivate option is enabled", async () => {
		const plugin = PackageJsonTransformPlugin({ forcePrivate: true });
		const mockApi = { processAssets: vi.fn(), expose: vi.fn(), useExposed: vi.fn().mockReturnValue(undefined) };

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof PackageJsonTransformPlugin>["setup"]>[0]);

		const optimizeCallback = mockApi.processAssets.mock.calls[1][1];

		const originalPackageJson: PackageJson = { name: "test", version: "1.0.0" };

		const mockPackageJsonAsset = {
			data: { ...originalPackageJson },
			update: vi.fn(),
		};
		// biome-ignore lint/suspicious/noExplicitAny: Mock object for testing
		mockJsonAssetCreate.mockResolvedValue(mockPackageJsonAsset as any);

		mockBuildPackageJson.mockResolvedValue({ ...originalPackageJson, private: false } as PackageJson);

		const mockContext = createMockContext();
		await optimizeCallback(mockContext);

		// Should have set private to true
		expect(mockPackageJsonAsset.data.private).toBe(true);
		expect(mockPackageJsonAsset.update).toHaveBeenCalled();
	});

	it("should handle useRollupTypes by updating exports to point to rollup types", async () => {
		const plugin = PackageJsonTransformPlugin();
		const mockApi = {
			processAssets: vi.fn(),
			expose: vi.fn(),
			useExposed: vi.fn().mockImplementation((key: string) => {
				if (key === "use-rollup-types") return true;
				return undefined;
			}),
		};

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof PackageJsonTransformPlugin>["setup"]>[0]);

		const optimizeCallback = mockApi.processAssets.mock.calls[1][1];

		const originalPackageJson: PackageJson = {
			name: "test",
			version: "1.0.0",
			exports: {
				".": {
					types: "./dist/index.d.ts",
					import: "./dist/index.js",
				},
				"./utils": {
					types: "./dist/utils.d.ts",
					import: "./dist/utils.js",
				},
				"./api-extractor": {
					types: "./api-extractor.d.ts",
				},
			},
		};

		const mockPackageJsonAsset = {
			data: JSON.parse(JSON.stringify(originalPackageJson)),
			update: vi.fn(),
		};
		// biome-ignore lint/suspicious/noExplicitAny: Mock object for testing
		mockJsonAssetCreate.mockResolvedValue(mockPackageJsonAsset as any);

		mockBuildPackageJson.mockResolvedValue(JSON.parse(JSON.stringify(originalPackageJson)));

		const mockContext = createMockContext();
		await optimizeCallback(mockContext);

		// Should have removed api-extractor export
		expect(mockPackageJsonAsset.data.exports["./api-extractor"]).toBeUndefined();

		// Should have updated types to point to rollup
		expect(mockPackageJsonAsset.data.exports["."].types).toBe("./index.d.ts");
		expect(mockPackageJsonAsset.data.exports["./utils"].types).toBe("./index.d.ts");

		expect(mockPackageJsonAsset.update).toHaveBeenCalled();
	});

	it("should not modify exports when useRollupTypes is false", async () => {
		const plugin = PackageJsonTransformPlugin();
		const mockApi = {
			processAssets: vi.fn(),
			expose: vi.fn(),
			useExposed: vi.fn().mockReturnValue(undefined), // useRollupTypes not set
		};

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof PackageJsonTransformPlugin>["setup"]>[0]);

		const optimizeCallback = mockApi.processAssets.mock.calls[1][1];

		const originalPackageJson: PackageJson = {
			name: "test",
			version: "1.0.0",
			exports: {
				".": {
					types: "./dist/index.d.ts",
					import: "./dist/index.js",
				},
			},
		};

		const mockPackageJsonAsset = {
			data: JSON.parse(JSON.stringify(originalPackageJson)),
			update: vi.fn(),
		};
		// biome-ignore lint/suspicious/noExplicitAny: Mock object for testing
		mockJsonAssetCreate.mockResolvedValue(mockPackageJsonAsset as any);

		mockBuildPackageJson.mockResolvedValue(JSON.parse(JSON.stringify(originalPackageJson)));

		const mockContext = createMockContext();
		await optimizeCallback(mockContext);

		// Should not have modified the types path
		expect(mockPackageJsonAsset.data.exports["."].types).toBe("./dist/index.d.ts");
	});

	it("should handle exports without types field when useRollupTypes is true", async () => {
		const plugin = PackageJsonTransformPlugin();
		const mockApi = {
			processAssets: vi.fn(),
			expose: vi.fn(),
			useExposed: vi.fn().mockImplementation((key: string) => {
				if (key === "use-rollup-types") return true;
				return undefined;
			}),
		};

		plugin.setup(mockApi as unknown as Parameters<ReturnType<typeof PackageJsonTransformPlugin>["setup"]>[0]);

		const optimizeCallback = mockApi.processAssets.mock.calls[1][1];

		const originalPackageJson: PackageJson = {
			name: "test",
			version: "1.0.0",
			exports: {
				".": {
					import: "./dist/index.js", // No types field
				},
				"./data": "./data.json", // String export, not object
			},
		};

		const mockPackageJsonAsset = {
			data: JSON.parse(JSON.stringify(originalPackageJson)),
			update: vi.fn(),
		};
		// biome-ignore lint/suspicious/noExplicitAny: Mock object for testing
		mockJsonAssetCreate.mockResolvedValue(mockPackageJsonAsset as any);

		mockBuildPackageJson.mockResolvedValue(JSON.parse(JSON.stringify(originalPackageJson)));

		const mockContext = createMockContext();
		await optimizeCallback(mockContext);

		// Should not crash and should not add types field where it didn't exist
		expect(mockPackageJsonAsset.data.exports["."].types).toBeUndefined();
		expect(mockPackageJsonAsset.data.exports["./data"]).toBe("./data.json");
	});
});
