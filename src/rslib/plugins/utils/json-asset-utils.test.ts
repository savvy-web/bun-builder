import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ProcessAssetsHandler } from "@rsbuild/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockAssetRegistry } from "../../../__test__/rslib/types/test-types.js";

// Mock node:fs/promises
vi.mock("node:fs/promises", () => ({
	readFile: vi.fn(),
}));

// Mock node:path
vi.mock("node:path", () => ({
	join: vi.fn(),
}));

const mockReadFile: ReturnType<typeof vi.mocked<typeof readFile>> = vi.mocked(readFile);
const mockJoin: ReturnType<typeof vi.mocked<typeof join>> = vi.mocked(join);

// Static import after mocks are set up
import { JsonAsset, TextAsset } from "./asset-utils.js";

// Helper function to create mock compilation context
function createMockContext(assets: MockAssetRegistry = {}): Parameters<ProcessAssetsHandler>[0] {
	const mockRawSource = vi.fn().mockImplementation(function (this: unknown, content: string) {
		return {
			source: () => content,
		};
	});

	// biome-ignore lint/suspicious/noExplicitAny: Mock compilation source for testing
	const mockEmitAsset = vi.fn().mockImplementation((fileName: string, source: any) => {
		// Simulate webpack behavior - emitted assets are added to the assets object
		assets[fileName] = source;
	});

	return {
		assets,
		sources: {
			RawSource: mockRawSource,
		},
		compilation: {
			emitAsset: mockEmitAsset,
			updateAsset: vi.fn(),
		},
	} as unknown as Parameters<ProcessAssetsHandler>[0];
}

describe("TextAsset", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockJoin.mockImplementation((...args) => args.join("/"));
		vi.spyOn(process, "cwd").mockReturnValue("/test/project");
	});

	describe("constructor", () => {
		it("should initialize with existing asset", () => {
			const mockAsset = {
				source: () => "test content",
			};
			const context = createMockContext({ "test.txt": mockAsset });

			const textAsset = new TextAsset(context, "test.txt");

			expect(textAsset.fileName).toBe("test.txt");
			expect(textAsset.source).toBe("test content");
		});

		it("should throw error if asset doesn't exist in context", () => {
			const context = createMockContext({});

			expect(() => new TextAsset(context, "missing.txt")).toThrow();
		});
	});

	describe("update", () => {
		it("should update asset with new source", () => {
			const mockAsset = {
				source: () => "original content",
			};
			const context = createMockContext({ "test.txt": mockAsset });
			const textAsset = new TextAsset(context, "test.txt");

			textAsset.source = "updated content";
			textAsset.update();

			expect(context.sources.RawSource).toHaveBeenCalledWith("updated content");
			expect(context.compilation.updateAsset).toHaveBeenCalledWith("test.txt", expect.anything());
		});
	});

	describe("create", () => {
		it("should return existing TextAsset when asset exists", async () => {
			const mockAsset = {
				source: () => "existing content",
			};
			const context = createMockContext({ "existing.txt": mockAsset });

			const textAsset = await TextAsset.create(context, "existing.txt");

			expect(textAsset).not.toBeNull();
			if (textAsset) {
				expect(textAsset.fileName).toBe("existing.txt");
				expect(textAsset.source).toBe("existing content");
			}
			expect(mockReadFile).not.toHaveBeenCalled();
		});

		it("should create new asset when file exists on disk", async () => {
			const context = createMockContext({});
			mockReadFile.mockResolvedValue("file content");

			const textAsset = await TextAsset.create(context, "new.txt");

			expect(textAsset).not.toBeNull();
			expect(mockJoin).toHaveBeenCalledWith("/test/project", "new.txt");
			expect(mockReadFile).toHaveBeenCalledWith("/test/project/new.txt", "utf-8");
			expect(context.sources.RawSource).toHaveBeenCalledWith("file content");
			expect(context.compilation.emitAsset).toHaveBeenCalledWith("new.txt", expect.anything());
			if (textAsset) {
				expect(textAsset.source).toBe("file content");
			}
		});

		it("should throw error when file doesn't exist on disk", async () => {
			const context = createMockContext({});
			mockReadFile.mockRejectedValue(new Error("ENOENT: no such file"));

			await expect(TextAsset.create(context, "missing.txt")).rejects.toThrow("Failed to load text asset: missing.txt");
		});

		it("should handle non-Error objects in catch block", async () => {
			const context = createMockContext({});
			mockReadFile.mockRejectedValue("string error");

			await expect(TextAsset.create(context, "error.txt")).rejects.toThrow(
				"Failed to load text asset: error.txt: string error",
			);
		});

		it("should return null when file doesn't exist and required is false", async () => {
			const context = createMockContext({});
			mockReadFile.mockRejectedValue(new Error("ENOENT: no such file"));

			const result = await TextAsset.create(context, "optional.txt", false);

			expect(result).toBeNull();
			expect(mockReadFile).toHaveBeenCalledWith("/test/project/optional.txt", "utf-8");
		});

		it("should throw error when file doesn't exist and required is true", async () => {
			const context = createMockContext({});
			mockReadFile.mockRejectedValue(new Error("ENOENT: no such file"));

			await expect(TextAsset.create(context, "required.txt", true)).rejects.toThrow(
				"Failed to load text asset: required.txt",
			);
		});

		it("should throw error when file doesn't exist and no required parameter provided (required defaults to true)", async () => {
			const context = createMockContext({});
			mockReadFile.mockRejectedValue(new Error("ENOENT: no such file"));

			await expect(TextAsset.create(context, "default-required.txt")).rejects.toThrow(
				"Failed to load text asset: default-required.txt",
			);
		});
	});
});

describe("JsonAsset", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockJoin.mockImplementation((...args) => args.join("/"));
		vi.spyOn(process, "cwd").mockReturnValue("/test/project");
	});

	describe("constructor", () => {
		it("should parse JSON content from asset", () => {
			const testData = { name: "test", version: "1.0.0" };
			const mockAsset = {
				source: () => JSON.stringify(testData),
			};
			const context = createMockContext({ "package.json": mockAsset });

			const jsonAsset = new JsonAsset(context, "package.json");

			expect(jsonAsset.fileName).toBe("package.json");
			expect(jsonAsset.source).toBe(JSON.stringify(testData));
			expect(jsonAsset.data).toEqual(testData);
		});

		it("should throw error for invalid JSON", () => {
			const mockAsset = {
				source: () => "invalid json {",
			};
			const context = createMockContext({ "invalid.json": mockAsset });

			expect(() => new JsonAsset(context, "invalid.json")).toThrow("Failed to parse JSON in invalid.json");
		});

		it("should handle non-Error objects in JSON parse catch", () => {
			const mockAsset = {
				source: () => "invalid json {",
			};
			const context = createMockContext({ "invalid.json": mockAsset });

			// Mock JSON.parse to throw a string
			const originalParse = JSON.parse;
			JSON.parse = vi.fn().mockImplementation(() => {
				throw "string error";
			});

			try {
				expect(() => new JsonAsset(context, "invalid.json")).toThrow(
					"Failed to parse JSON in invalid.json: string error",
				);
			} finally {
				JSON.parse = originalParse;
			}
		});
	});

	describe("update", () => {
		it("should stringify data and call parent update", () => {
			const testData = { name: "test" };
			const mockAsset = {
				source: () => JSON.stringify(testData),
			};
			const context = createMockContext({ "test.json": mockAsset });
			const jsonAsset = new JsonAsset(context, "test.json");

			jsonAsset.data = { name: "updated", version: "2.0.0" };
			jsonAsset.update();

			expect(jsonAsset.source).toBe(JSON.stringify({ name: "updated", version: "2.0.0" }, null, "\t"));
			expect(context.sources.RawSource).toHaveBeenCalledWith(jsonAsset.source);
			expect(context.compilation.updateAsset).toHaveBeenCalledWith("test.json", expect.anything());
		});
	});

	describe("create", () => {
		it("should return existing JsonAsset when asset exists", async () => {
			const testData = { name: "existing" };
			const mockAsset = {
				source: () => JSON.stringify(testData),
			};
			const context = createMockContext({ "existing.json": mockAsset });

			const jsonAsset = await JsonAsset.create(context, "existing.json");

			expect(jsonAsset).not.toBeNull();
			if (jsonAsset) {
				expect(jsonAsset.fileName).toBe("existing.json");
				expect(jsonAsset.data).toEqual(testData);
			}
			expect(mockReadFile).not.toHaveBeenCalled();
		});

		it("should create new JsonAsset when file exists on disk", async () => {
			const testData = { name: "from-disk", version: "1.0.0" };
			const context = createMockContext({});
			mockReadFile.mockResolvedValue(JSON.stringify(testData));

			const jsonAsset = await JsonAsset.create(context, "new.json");

			expect(jsonAsset).not.toBeNull();
			expect(mockJoin).toHaveBeenCalledWith("/test/project", "new.json");
			expect(mockReadFile).toHaveBeenCalledWith("/test/project/new.json", "utf-8");
			expect(context.sources.RawSource).toHaveBeenCalledWith(JSON.stringify(testData));
			expect(context.compilation.emitAsset).toHaveBeenCalledWith("new.json", expect.anything());
			if (jsonAsset) {
				expect(jsonAsset.data).toEqual(testData);
			}
		});

		it("should return null when file doesn't exist on disk and required defaults to false", async () => {
			const context = createMockContext({});
			mockReadFile.mockRejectedValue(new Error("ENOENT: no such file"));

			const result = await JsonAsset.create(context, "missing.json");

			expect(result).toBeNull();
		});

		it("should return null for non-Error objects when not required", async () => {
			const context = createMockContext({});
			mockReadFile.mockRejectedValue("string error");

			const result = await JsonAsset.create(context, "error.json", false);

			expect(result).toBeNull();
		});

		it("should throw for non-Error objects when required is true", async () => {
			const context = createMockContext({});
			mockReadFile.mockRejectedValue("string error");

			await expect(JsonAsset.create(context, "error.json", true)).rejects.toThrow(
				"Failed to load JSON asset: error.json: string error",
			);
		});

		it("should return null when file doesn't exist and required is false", async () => {
			const context = createMockContext({});
			mockReadFile.mockRejectedValue(new Error("ENOENT: no such file"));

			const result = await JsonAsset.create(context, "optional.json", false);

			expect(result).toBeNull();
			expect(mockReadFile).toHaveBeenCalledWith("/test/project/optional.json", "utf-8");
		});

		it("should throw error when file doesn't exist and required is true", async () => {
			const context = createMockContext({});
			mockReadFile.mockRejectedValue(new Error("ENOENT: no such file"));

			await expect(JsonAsset.create(context, "required.json", true)).rejects.toThrow(
				"Failed to load JSON asset: required.json",
			);
		});

		it("should throw error when file doesn't exist and no required parameter provided (required defaults to false)", async () => {
			const context = createMockContext({});
			mockReadFile.mockRejectedValue(new Error("ENOENT: no such file"));

			const result = await JsonAsset.create(context, "default-not-required.json");

			expect(result).toBeNull();
		});
	});

	describe("inheritance", () => {
		it("should inherit TextAsset properties and methods", async () => {
			const testData = { name: "test" };
			const context = createMockContext({});
			mockReadFile.mockResolvedValue(JSON.stringify(testData));

			const jsonAsset = await JsonAsset.create(context, "test.json");

			expect(jsonAsset).not.toBeNull();
			if (jsonAsset) {
				expect(jsonAsset).toBeInstanceOf(TextAsset);
				expect(jsonAsset.fileName).toBe("test.json");
				expect(typeof jsonAsset.update).toBe("function");
			}
		});
	});
});
