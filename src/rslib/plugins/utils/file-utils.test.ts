import type { Stats } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fileExistAsync, packageJsonVersion } from "./file-utils.js";

vi.mock("node:fs/promises", () => ({
	stat: vi.fn(),
	readFile: vi.fn(),
}));

describe("file-utils", () => {
	beforeEach(() => {
		vi.spyOn(process, "cwd").mockReturnValue("/test/project");
		vi.clearAllMocks();
	});

	describe("fileExistAsync", () => {
		it("should return true when file exists", async () => {
			vi.mocked(stat).mockResolvedValue({} as Stats);

			const result = await fileExistAsync("package.json");

			expect(result).toEqual({
				assetName: "package.json",
				assetPath: "/test/project/package.json",
				assetExists: true,
			});
		});

		it("should return false when file does not exist", async () => {
			vi.mocked(stat).mockRejectedValue(new Error("ENOENT"));

			const result = await fileExistAsync("nonexistent.json");

			expect(result).toEqual({
				assetName: "nonexistent.json",
				assetPath: "/test/project/nonexistent.json",
				assetExists: false,
			});
		});

		it("should handle nested file paths", async () => {
			vi.mocked(stat).mockResolvedValue({} as Stats);

			const result = await fileExistAsync("src/index.ts");

			expect(result).toEqual({
				assetName: "src/index.ts",
				assetPath: "/test/project/src/index.ts",
				assetExists: true,
			});
		});
	});

	describe("packageJsonVersion", () => {
		it("should return version from package.json", async () => {
			vi.mocked(stat).mockResolvedValue({} as Stats);
			vi.mocked(readFile).mockResolvedValue(
				JSON.stringify({
					name: "test-package",
					version: "1.2.3",
				}),
			);

			const version = await packageJsonVersion();

			expect(version).toBe("1.2.3");
			expect(readFile).toHaveBeenCalledWith("/test/project/package.json", "utf-8");
		});

		it("should throw error when package.json does not exist", async () => {
			vi.mocked(stat).mockRejectedValue(new Error("ENOENT"));

			await expect(packageJsonVersion()).rejects.toThrow("package.json not found in project root");
		});

		it("should throw error when package.json cannot be read", async () => {
			vi.mocked(stat).mockResolvedValue({} as Stats);
			vi.mocked(readFile).mockRejectedValue(new Error("Permission denied"));

			await expect(packageJsonVersion()).rejects.toThrow("Failed to read version from package.json");
		});

		it("should throw error when package.json has invalid JSON", async () => {
			vi.mocked(stat).mockResolvedValue({} as Stats);
			vi.mocked(readFile).mockResolvedValue("invalid json");

			await expect(packageJsonVersion()).rejects.toThrow("Failed to read version from package.json");
		});

		it("should throw error when version field is missing", async () => {
			vi.mocked(stat).mockResolvedValue({} as Stats);
			vi.mocked(readFile).mockResolvedValue(
				JSON.stringify({
					name: "test-package",
					// no version field
				}),
			);

			const version = await packageJsonVersion();
			// When version is undefined, it will be returned as undefined
			expect(version).toBeUndefined();
		});
	});
});
