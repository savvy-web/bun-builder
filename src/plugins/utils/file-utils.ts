/**
 * File system utilities for the Bun Library Builder.
 *
 * @remarks
 * This module provides file system utilities for common build operations,
 * including file existence checking, workspace root discovery, and
 * tool binary path resolution.
 *
 * @packageDocumentation
 */

import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

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
 * Asynchronously checks if a file exists in the current working directory.
 *
 * @param assetName - The relative path to the file from `process.cwd()`
 * @returns A promise resolving to file existence information
 *
 * @example
 * ```typescript
 * import { fileExistAsync } from '@savvy-web/bun-builder';
 *
 * const result = await fileExistAsync('package.json');
 * if (result.assetExists) {
 *   console.log(`Found at: ${result.assetPath}`);
 * }
 * ```
 *
 * @public
 */
export async function fileExistAsync(assetName: string): Promise<FileExistResult> {
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
 * import { packageJsonVersion } from '@savvy-web/bun-builder';
 *
 * const version = await packageJsonVersion();
 * console.log(`Building version ${version}`);
 * ```
 *
 * @public
 */
export async function packageJsonVersion(): Promise<string> {
	const { assetExists, assetPath } = await fileExistAsync("package.json");
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
 * import { findWorkspaceRoot } from '@savvy-web/bun-builder';
 *
 * const root = findWorkspaceRoot();
 * if (root) {
 *   console.log(`Workspace root: ${root}`);
 * } else {
 *   console.log('Not in a workspace');
 * }
 * ```
 *
 * @public
 */
export function findWorkspaceRoot(startDir: string = process.cwd()): string | null {
	const { dirname, resolve } = require("node:path");
	let currentDir = resolve(startDir);
	const root = dirname(currentDir);

	while (currentDir !== root) {
		const packageJsonPath = join(currentDir, "package.json");
		try {
			if (existsSync(packageJsonPath)) {
				const { readFileSync } = require("node:fs");
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
 * import { getApiExtractorPath } from '@savvy-web/bun-builder';
 *
 * try {
 *   const apiExtractorPath = getApiExtractorPath();
 *   console.log(`API Extractor found at: ${apiExtractorPath}`);
 * } catch {
 *   console.log('API Extractor not installed');
 * }
 * ```
 *
 * @public
 */
export function getApiExtractorPath(): string {
	const cwd = process.cwd();

	// First, try the current package's node_modules
	const localApiExtractor = join(cwd, "node_modules", "@microsoft", "api-extractor");
	if (existsSync(localApiExtractor)) {
		return localApiExtractor;
	}

	// If not found locally, try workspace root
	const workspaceRoot = findWorkspaceRoot(cwd);
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
 * Unlike {@link getApiExtractorPath}, this function does not throw if
 * the binary is not found. It returns the local path as a fallback,
 * allowing the caller to handle the missing binary.
 *
 * @returns The absolute path to the tsgo binary
 *
 * @public
 */
export function getTsgoBinPath(): string {
	const cwd = process.cwd();

	// First, try the current package's node_modules
	const localTsgoBin = join(cwd, "node_modules", ".bin", "tsgo");
	if (existsSync(localTsgoBin)) {
		return localTsgoBin;
	}

	// If not found locally, try workspace root
	const workspaceRoot = findWorkspaceRoot(cwd);
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
 * import { getUnscopedPackageName } from '@savvy-web/bun-builder';
 *
 * getUnscopedPackageName('@savvy-web/bun-builder'); // "bun-builder"
 * getUnscopedPackageName('lodash');                  // "lodash"
 * ```
 *
 * @public
 */
export function getUnscopedPackageName(name: string): string {
	return name.startsWith("@") ? (name.split("/")[1] ?? name) : name;
}
