/**
 * File system utilities for the Bun Library Builder.
 *
 * @remarks
 * This module provides the {@link FileSystemUtils} and {@link LocalPathValidator}
 * classes for common build operations, including file existence checking,
 * workspace root discovery, and tool binary path resolution.
 *
 * @packageDocumentation
 */

import { existsSync, readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

/**
 * Result of checking file existence.
 *
 * @public
 */
export interface FileExistResult {
	/**
	 * The original relative file name that was checked.
	 */
	assetName: string;

	/**
	 * The resolved absolute path to the file.
	 */
	assetPath: string;

	/**
	 * Whether the file exists at the resolved path.
	 */
	assetExists: boolean;
}

/**
 * File system utilities for build operations.
 *
 * @remarks
 * This class provides static methods for common file system operations needed
 * during the build process. It handles:
 *
 * - File existence checking (sync and async)
 * - Package.json version reading
 * - Workspace root discovery
 * - Tool binary path resolution (API Extractor, tsgo)
 * - Package name parsing
 *
 * @example
 * Check file existence and read package version:
 * ```typescript
 * import { FileSystemUtils } from '@savvy-web/bun-builder';
 *
 * const exists = await FileSystemUtils.fileExistsAsync('package.json');
 * if (exists.assetExists) {
 *   const version = await FileSystemUtils.packageJsonVersion();
 *   console.log(`Building version ${version}`);
 * }
 * ```
 *
 * @example
 * Find workspace root and tool paths:
 * ```typescript
 * import { FileSystemUtils } from '@savvy-web/bun-builder';
 *
 * const workspaceRoot = FileSystemUtils.findWorkspaceRoot();
 * const tsgoBin = FileSystemUtils.getTsgoBinPath();
 * const apiExtractor = FileSystemUtils.getApiExtractorPath();
 * ```
 *
 * @public
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Intentional static-only class for API organization
export class FileSystemUtils {
	/**
	 * Asynchronously checks if a file exists in the current working directory.
	 *
	 * @param assetName - The relative path to the file from `process.cwd()`
	 * @returns A promise resolving to file existence information
	 *
	 * @example
	 * ```typescript
	 * import { FileSystemUtils } from '@savvy-web/bun-builder';
	 *
	 * const result = await FileSystemUtils.fileExistsAsync('package.json');
	 * if (result.assetExists) {
	 *   console.log(`Found at: ${result.assetPath}`);
	 * }
	 * ```
	 */
	static async fileExistsAsync(assetName: string): Promise<FileExistResult> {
		const assetPath = join(process.cwd(), assetName);
		const assetExists = !!(await stat(assetPath).catch(() => false));
		return {
			assetName,
			assetPath,
			assetExists,
		};
	}

	/**
	 * Reads the version from package.json in the current working directory.
	 *
	 * @returns Promise resolving to the package version string
	 * @throws Error if package.json is not found
	 * @throws Error if version field cannot be read from package.json
	 *
	 * @example
	 * ```typescript
	 * import { FileSystemUtils } from '@savvy-web/bun-builder';
	 *
	 * const version = await FileSystemUtils.packageJsonVersion();
	 * console.log(`Building version ${version}`);
	 * ```
	 */
	static async packageJsonVersion(): Promise<string> {
		const { assetExists, assetPath } = await FileSystemUtils.fileExistsAsync("package.json");
		if (!assetExists) {
			throw new Error("package.json not found in project root");
		}
		try {
			const json = await readFile(assetPath, "utf-8");
			const { version } = JSON.parse(json);
			return version;
		} catch {
			throw new Error("Failed to read version from package.json");
		}
	}

	/**
	 * Finds the workspace root by looking for a package.json with workspaces field.
	 *
	 * @remarks
	 * Traverses up the directory tree from `startDir` looking for a package.json
	 * that contains a `workspaces` field, indicating a monorepo root.
	 *
	 * @param startDir - The directory to start searching from (defaults to `process.cwd()`)
	 * @returns The absolute path to the workspace root, or `null` if not found
	 *
	 * @example
	 * ```typescript
	 * import { FileSystemUtils } from '@savvy-web/bun-builder';
	 *
	 * const root = FileSystemUtils.findWorkspaceRoot();
	 * if (root) {
	 *   console.log(`Workspace root: ${root}`);
	 * } else {
	 *   console.log('Not in a workspace');
	 * }
	 * ```
	 */
	static findWorkspaceRoot(startDir: string = process.cwd()): string | null {
		let currentDir = resolve(startDir);
		const root = dirname(currentDir);

		while (currentDir !== root) {
			const packageJsonPath = join(currentDir, "package.json");
			try {
				if (existsSync(packageJsonPath)) {
					const content = readFileSync(packageJsonPath, "utf-8");
					const pkg = JSON.parse(content);

					if (pkg.workspaces) {
						return currentDir;
					}
				}
			} catch {
				// Continue up
			}

			currentDir = dirname(currentDir);
		}

		return null;
	}

	/**
	 * Gets the path to the `@microsoft/api-extractor` package.
	 *
	 * @remarks
	 * Searches for API Extractor in the following locations:
	 * 1. Local `node_modules/@microsoft/api-extractor`
	 * 2. Workspace root `node_modules/@microsoft/api-extractor`
	 *
	 * @returns The absolute path to the api-extractor package directory
	 * @throws Error if the package is not installed
	 *
	 * @example
	 * ```typescript
	 * import { FileSystemUtils } from '@savvy-web/bun-builder';
	 *
	 * try {
	 *   const apiExtractorPath = FileSystemUtils.getApiExtractorPath();
	 *   console.log(`API Extractor found at: ${apiExtractorPath}`);
	 * } catch {
	 *   console.log('API Extractor not installed');
	 * }
	 * ```
	 */
	static getApiExtractorPath(): string {
		const cwd = process.cwd();

		// First, try the current package's node_modules
		const localApiExtractor = join(cwd, "node_modules", "@microsoft", "api-extractor");
		if (existsSync(localApiExtractor)) {
			return localApiExtractor;
		}

		// If not found locally, try workspace root
		const workspaceRoot = FileSystemUtils.findWorkspaceRoot(cwd);
		if (workspaceRoot) {
			const workspaceApiExtractor = join(workspaceRoot, "node_modules", "@microsoft", "api-extractor");
			if (existsSync(workspaceApiExtractor)) {
				return workspaceApiExtractor;
			}
		}

		throw new Error(
			"API Extractor bundling requires @microsoft/api-extractor to be installed.\n" +
				"Install it with: bun add -D @microsoft/api-extractor",
		);
	}

	/**
	 * Gets the path to the tsgo binary.
	 *
	 * @remarks
	 * Searches for the tsgo binary in the following locations:
	 * 1. Local `node_modules/.bin/tsgo`
	 * 2. Workspace root `node_modules/.bin/tsgo`
	 *
	 * Unlike {@link FileSystemUtils.getApiExtractorPath}, this method does not throw if
	 * the binary is not found. It returns the local path as a fallback,
	 * allowing the caller to handle the missing binary.
	 *
	 * @returns The absolute path to the tsgo binary
	 *
	 * @example
	 * ```typescript
	 * import { FileSystemUtils } from '@savvy-web/bun-builder';
	 *
	 * const tsgoBin = FileSystemUtils.getTsgoBinPath();
	 * console.log(`tsgo binary at: ${tsgoBin}`);
	 * ```
	 */
	static getTsgoBinPath(): string {
		const cwd = process.cwd();

		// First, try the current package's node_modules
		const localTsgoBin = join(cwd, "node_modules", ".bin", "tsgo");
		if (existsSync(localTsgoBin)) {
			return localTsgoBin;
		}

		// If not found locally, try workspace root
		const workspaceRoot = FileSystemUtils.findWorkspaceRoot(cwd);
		if (workspaceRoot) {
			const workspaceTsgoBin = join(workspaceRoot, "node_modules", ".bin", "tsgo");
			if (existsSync(workspaceTsgoBin)) {
				return workspaceTsgoBin;
			}
		}

		// Fallback to current directory
		return localTsgoBin;
	}

	/**
	 * Extracts the unscoped package name from a potentially scoped package name.
	 *
	 * @remarks
	 * Useful for generating filenames from package names where the scope
	 * prefix should be removed.
	 *
	 * @param name - The package name (scoped or unscoped)
	 * @returns The unscoped name without the `@scope/` prefix
	 *
	 * @example
	 * ```typescript
	 * import { FileSystemUtils } from '@savvy-web/bun-builder';
	 *
	 * FileSystemUtils.getUnscopedPackageName('@savvy-web/bun-builder'); // "bun-builder"
	 * FileSystemUtils.getUnscopedPackageName('lodash');                  // "lodash"
	 * ```
	 */
	static getUnscopedPackageName(name: string): string {
		return name.startsWith("@") ? (name.split("/")[1] ?? name) : name;
	}
}

/**
 * Utilities for validating and managing local file paths.
 *
 * @remarks
 * This class provides static methods for path validation operations used
 * during the build process. It ensures that destination directories exist
 * before attempting to copy build artifacts.
 *
 * @example
 * Validate paths before copying:
 * ```typescript
 * import { LocalPathValidator } from '@savvy-web/bun-builder';
 *
 * // Validate that parent directories exist
 * LocalPathValidator.validatePaths(process.cwd(), ['../docs/api', './output']);
 *
 * // Check a single path
 * const isValid = LocalPathValidator.isValidPath(process.cwd(), '../docs/api');
 * ```
 *
 * @public
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Intentional static-only class for API organization
export class LocalPathValidator {
	/**
	 * Validates that parent directories exist for all specified paths.
	 *
	 * @remarks
	 * This method checks that the parent directory of each path exists.
	 * The final directory itself does not need to exist as it will be
	 * created during the copy operation. This validation prevents errors
	 * when attempting to create deeply nested directories where intermediate
	 * parents are missing.
	 *
	 * @param cwd - The current working directory for path resolution
	 * @param paths - Array of relative paths to validate
	 * @throws Error if any parent directory does not exist
	 *
	 * @example
	 * ```typescript
	 * import { LocalPathValidator } from '@savvy-web/bun-builder';
	 *
	 * // Throws if parent of '../docs/api' doesn't exist
	 * LocalPathValidator.validatePaths(process.cwd(), ['../docs/api', './output']);
	 * ```
	 */
	static validatePaths(cwd: string, paths: string[]): void {
		for (const localPath of paths) {
			const resolvedPath = join(cwd, localPath);
			const parentDir = dirname(resolvedPath);

			if (!existsSync(parentDir)) {
				throw new Error(`Invalid localPath "${localPath}": parent directory does not exist: ${parentDir}`);
			}
		}
	}

	/**
	 * Checks whether a single path has a valid parent directory.
	 *
	 * @remarks
	 * Unlike {@link LocalPathValidator.validatePaths}, this method returns a boolean
	 * instead of throwing an error, making it suitable for conditional logic.
	 *
	 * @param cwd - The current working directory for path resolution
	 * @param localPath - The relative path to check
	 * @returns `true` if the parent directory exists, `false` otherwise
	 *
	 * @example
	 * ```typescript
	 * import { LocalPathValidator } from '@savvy-web/bun-builder';
	 *
	 * if (LocalPathValidator.isValidPath(process.cwd(), '../docs/api')) {
	 *   console.log('Path is valid for copying');
	 * }
	 * ```
	 */
	static isValidPath(cwd: string, localPath: string): boolean {
		const resolvedPath = join(cwd, localPath);
		const parentDir = dirname(resolvedPath);
		return existsSync(parentDir);
	}
}
