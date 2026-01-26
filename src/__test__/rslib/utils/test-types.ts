import type { Stats } from "node:fs";
import type { ProcessAssetsHandler } from "@rsbuild/core";
import { vi } from "vitest";

/**
 * Mock types for test utilities to avoid `as any` usage
 */
export const createMockStats = (mtime: Date, isFile: boolean = false): Stats => ({
	mtime,
	isFile: (): boolean => isFile,
	isDirectory: (): boolean => false,
	isBlockDevice: (): boolean => false,
	isCharacterDevice: (): boolean => false,
	isSymbolicLink: (): boolean => false,
	isFIFO: (): boolean => false,
	isSocket: (): boolean => false,
	dev: 1,
	ino: 1,
	mode: 1,
	nlink: 1,
	uid: 1,
	gid: 1,
	rdev: 1,
	size: 1,
	blksize: 1,
	blocks: 1,
	atimeMs: mtime.getTime(),
	mtimeMs: mtime.getTime(),
	ctimeMs: mtime.getTime(),
	birthtimeMs: mtime.getTime(),
	atime: mtime,
	ctime: mtime,
	birthtime: mtime,
});

export type MockWorkspaceRoot = string | undefined;

/**
 * Type alias for the ProcessAssetsHandler parameter
 */
export type ProcessAssetsContext = Parameters<ProcessAssetsHandler>[0];

/**
 * Create a mock ProcessAssetsHandler context for testing
 */
export function createMockProcessAssetsContext(
	mockOriginalSource: ReturnType<typeof vi.fn> = vi.fn(),
	mockEmitAsset: ReturnType<typeof vi.fn> = vi.fn(),
): ProcessAssetsContext {
	return {
		assets: {},
		compiler: {} as unknown as Parameters<ProcessAssetsHandler>[0]["compiler"],
		compilation: { emitAsset: mockEmitAsset } as unknown as Parameters<ProcessAssetsHandler>[0]["compilation"],
		environment: {} as unknown as Parameters<ProcessAssetsHandler>[0]["environment"],
		sources: { OriginalSource: mockOriginalSource } as unknown as Parameters<ProcessAssetsHandler>[0]["sources"],
	};
}
