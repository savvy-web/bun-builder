import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getWorkspaceRoot } from "workspace-tools";
import { getApiExtractorPath } from "./file-utils.js";

vi.mock("node:fs", () => ({
	existsSync: vi.fn(),
}));

vi.mock("workspace-tools", () => ({
	getWorkspaceRoot: vi.fn(),
}));

describe("dependency-path-utils", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("getApiExtractorPath", () => {
		it("should return local path when api-extractor exists in local node_modules", () => {
			const cwd = "/test/project";
			vi.spyOn(process, "cwd").mockReturnValue(cwd);

			const localPath = join(cwd, "node_modules", "@microsoft", "api-extractor");
			vi.mocked(existsSync).mockReturnValue(true);

			const result = getApiExtractorPath();

			expect(result).toBe(localPath);
			expect(existsSync).toHaveBeenCalledWith(localPath);
			expect(getWorkspaceRoot).not.toHaveBeenCalled();
		});

		it("should return workspace root path when local not found but workspace has it", () => {
			const cwd = "/test/project/packages/pkg";
			const workspaceRoot = "/test/project";
			vi.spyOn(process, "cwd").mockReturnValue(cwd);

			const localPath = join(cwd, "node_modules", "@microsoft", "api-extractor");
			const workspacePath = join(workspaceRoot, "node_modules", "@microsoft", "api-extractor");

			// First call for local path returns false, second call for workspace path returns true
			vi.mocked(existsSync).mockReturnValueOnce(false).mockReturnValueOnce(true);
			vi.mocked(getWorkspaceRoot).mockReturnValue(workspaceRoot);

			const result = getApiExtractorPath();

			expect(result).toBe(workspacePath);
			expect(existsSync).toHaveBeenCalledWith(localPath);
			expect(existsSync).toHaveBeenCalledWith(workspacePath);
			expect(getWorkspaceRoot).toHaveBeenCalledWith(cwd);
		});

		it("should throw error when api-extractor not found locally and no workspace root", () => {
			const cwd = "/test/project";
			vi.spyOn(process, "cwd").mockReturnValue(cwd);

			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(getWorkspaceRoot).mockReturnValue(undefined);

			expect(() => getApiExtractorPath()).toThrow(
				"API Extractor bundling requires @microsoft/api-extractor to be installed.\n" +
					"Install it with: pnpm add -D @microsoft/api-extractor",
			);

			expect(getWorkspaceRoot).toHaveBeenCalledWith(cwd);
		});

		it("should throw error when api-extractor not found in workspace root", () => {
			const cwd = "/test/project/packages/pkg";
			const workspaceRoot = "/test/project";
			vi.spyOn(process, "cwd").mockReturnValue(cwd);

			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(getWorkspaceRoot).mockReturnValue(workspaceRoot);

			expect(() => getApiExtractorPath()).toThrow(
				"API Extractor bundling requires @microsoft/api-extractor to be installed.\n" +
					"Install it with: pnpm add -D @microsoft/api-extractor",
			);

			const localPath = join(cwd, "node_modules", "@microsoft", "api-extractor");
			const workspacePath = join(workspaceRoot, "node_modules", "@microsoft", "api-extractor");

			expect(existsSync).toHaveBeenCalledWith(localPath);
			expect(existsSync).toHaveBeenCalledWith(workspacePath);
			expect(getWorkspaceRoot).toHaveBeenCalledWith(cwd);
		});

		it("should check workspace root path when getWorkspaceRoot returns empty string", () => {
			const cwd = "/test/project";
			vi.spyOn(process, "cwd").mockReturnValue(cwd);

			vi.mocked(existsSync).mockReturnValue(false);
			vi.mocked(getWorkspaceRoot).mockReturnValue("");

			expect(() => getApiExtractorPath()).toThrow(
				"API Extractor bundling requires @microsoft/api-extractor to be installed.\n" +
					"Install it with: pnpm add -D @microsoft/api-extractor",
			);

			expect(getWorkspaceRoot).toHaveBeenCalledWith(cwd);
		});

		it("should construct correct paths with nested directories", () => {
			const cwd = "/users/name/projects/monorepo/packages/sub/nested";
			vi.spyOn(process, "cwd").mockReturnValue(cwd);

			const localPath = join(cwd, "node_modules", "@microsoft", "api-extractor");
			vi.mocked(existsSync).mockReturnValue(true);

			const result = getApiExtractorPath();

			expect(result).toBe(localPath);
			expect(result).toBe("/users/name/projects/monorepo/packages/sub/nested/node_modules/@microsoft/api-extractor");
		});
	});
});
