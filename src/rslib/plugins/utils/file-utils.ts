import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { getWorkspaceRoot } from "workspace-tools";

/**
 * Result of checking file existence.
 */
export interface FileExistResult {
	assetName: string;
	assetPath: string;
	assetExists: boolean;
}

/**
 * Asynchronously checks if a file exists in the current working directory.
 *
 * @remarks
 * This function safely checks file existence without throwing errors for missing files.
 * It uses the Node.js `fs.stat()` method internally and catches any filesystem errors.
 * The file path is resolved relative to the current working directory using `process.cwd()`.
 *
 * @param assetName - The relative path to the file from the current working directory
 * @returns A promise that resolves to file existence info
 *
 * @example
 * ```typescript
 * // Check if package.json exists in the current directory
 * const { assetExists } = await fileExistAsync('package.json');
 * console.log(assetExists); // true or false
 *
 * // Check if a nested file exists
 * const { assetPath, assetExists } = await fileExistAsync('src/index.ts');
 * if (assetExists) {
 *   console.log('File found at:', assetPath);
 * }
 * ```
 *
 * @see {@link https://nodejs.org/api/fs.html#fspromisesstatpath-options | Node.js fs.stat documentation}
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
 * @throws If package.json is not found or version cannot be read
 *
 * @example
 * ```typescript
 * const version = await packageJsonVersion();
 * console.log(`Current version: ${version}`);
 * ```
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
 * Gets the path to the `@microsoft/api-extractor` package.
 *
 * @remarks
 * Uses workspace-tools to find the workspace root and searches for the package.
 * Supports npm, pnpm, yarn, rush, and lerna workspaces.
 *
 * The search order is:
 * 1. Current package's node_modules
 * 2. Workspace root's node_modules (if in a workspace)
 *
 * @returns The absolute path to the api-extractor package directory
 * @throws Error if the package is not found
 *
 * @example
 * ```typescript
 * const apiExtractorPath = getApiExtractorPath();
 * console.log(apiExtractorPath);
 * // "/path/to/workspace/node_modules/@microsoft/api-extractor"
 * ```
 */
export function getApiExtractorPath(): string {
	const cwd = process.cwd();

	// First, try the current package's node_modules
	const localApiExtractor = join(cwd, "node_modules", "@microsoft", "api-extractor");
	if (existsSync(localApiExtractor)) {
		return localApiExtractor;
	}

	// If not found locally, use workspace-tools to find the workspace root
	// This handles pnpm, npm, yarn, rush, and lerna workspaces
	const workspaceRoot = getWorkspaceRoot(cwd);
	if (workspaceRoot) {
		const workspaceApiExtractor = join(workspaceRoot, "node_modules", "@microsoft", "api-extractor");
		if (existsSync(workspaceApiExtractor)) {
			return workspaceApiExtractor;
		}
	}

	// If not found, throw a clear error
	throw new Error(
		"API Extractor bundling requires @microsoft/api-extractor to be installed.\n" +
			"Install it with: pnpm add -D @microsoft/api-extractor",
	);
}
