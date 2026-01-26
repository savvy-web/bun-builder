import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NodeLibraryBuilder } from "./node-library-builder.js";

// Mock node:fs
vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
}));

// Mock node:path
vi.mock("node:path", () => ({
	join: vi.fn((...args: string[]) => args.join("/")),
}));

describe("NodeLibraryBuilder", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	describe("DEFAULT_OPTIONS", () => {
		it("should have expected default values", () => {
			expect(NodeLibraryBuilder.DEFAULT_OPTIONS).toEqual({
				entry: undefined,
				plugins: [],
				define: {},
				copyPatterns: [],
				targets: ["dev", "npm"],
				tsconfigPath: undefined,
				externals: [],
				dtsBundledPackages: undefined,
				transformFiles: undefined,
			});
		});
	});

	describe("mergeOptions", () => {
		it("should return default options when no options provided", () => {
			vi.mocked(existsSync).mockReturnValue(false);

			const result = NodeLibraryBuilder.mergeOptions();

			expect(result).toEqual(NodeLibraryBuilder.DEFAULT_OPTIONS);
		});

		it("should merge provided options with defaults", () => {
			vi.mocked(existsSync).mockReturnValue(false);

			const result = NodeLibraryBuilder.mergeOptions({
				targets: ["npm"],
			});

			expect(result).toMatchObject({
				targets: ["npm"],
				// Should still have defaults for other properties
				plugins: [],
				define: {},
				copyPatterns: [],
			});
		});

		it("should add public directory to copyPatterns when it exists", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(join).mockReturnValue("/test/cwd/public");

			const result = NodeLibraryBuilder.mergeOptions();

			expect(existsSync).toHaveBeenCalledWith("/test/cwd/public");
			expect(result.copyPatterns).toHaveLength(1);
			expect(result.copyPatterns[0]).toEqual({
				from: "./public",
				to: "./",
				context: process.cwd(),
			});
		});

		it("should not add public directory to copyPatterns when it does not exist", () => {
			vi.mocked(existsSync).mockReturnValue(false);

			const result = NodeLibraryBuilder.mergeOptions();

			expect(result.copyPatterns).toHaveLength(0);
		});

		it("should prepend public directory pattern to existing copyPatterns", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(join).mockReturnValue("/test/cwd/public");

			const customPatterns = [{ from: "./assets", to: "./assets" }];
			const result = NodeLibraryBuilder.mergeOptions({
				copyPatterns: customPatterns,
			});

			expect(result.copyPatterns).toHaveLength(2);
			expect(result.copyPatterns[0]).toEqual({
				from: "./public",
				to: "./",
				context: process.cwd(),
			});
			expect(result.copyPatterns[1]).toEqual({ from: "./assets", to: "./assets" });
		});

		it("should handle partial options correctly", () => {
			vi.mocked(existsSync).mockReturnValue(false);

			const result = NodeLibraryBuilder.mergeOptions({
				externals: ["react", "react-dom"],
				dtsBundledPackages: ["@types/node"],
			});

			expect(result.externals).toEqual(["react", "react-dom"]);
			expect(result.dtsBundledPackages).toEqual(["@types/node"]);
		});

		it("should preserve user-provided plugins array", () => {
			vi.mocked(existsSync).mockReturnValue(false);

			const mockPlugin = { name: "test-plugin", setup: vi.fn() };
			const result = NodeLibraryBuilder.mergeOptions({
				plugins: [mockPlugin],
			});

			expect(result.plugins).toHaveLength(1);
			expect(result.plugins[0]).toBe(mockPlugin);
		});

		it("should allow overriding targets", () => {
			vi.mocked(existsSync).mockReturnValue(false);

			const result = NodeLibraryBuilder.mergeOptions({
				targets: ["npm"],
			});

			expect(result.targets).toEqual(["npm"]);
		});
	});
});
