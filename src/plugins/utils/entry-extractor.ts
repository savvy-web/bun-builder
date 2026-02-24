/**
 * Entry point extraction from package.json.
 *
 * @remarks
 * This module provides utilities for extracting TypeScript entry points from
 * package.json's `exports` and `bin` fields. It handles various export formats
 * and automatically maps JavaScript paths back to TypeScript sources.
 *
 */

import type { PackageJson } from "../../types/package-json.js";

/**
 * Options for entry extraction.
 *
 * @internal
 */
export interface EntryExtractorOptions {
	/**
	 * Generate index files in nested directories matching export paths.
	 *
	 * @remarks
	 * When `true`, export paths create a directory structure with index files.
	 * When `false`, export paths are converted to flat files with hyphenated names.
	 *
	 * @example
	 * When `exportsAsIndexes` is `true`:
	 * ```text
	 * "./foo/bar" -> "foo/bar/index"
	 * ```
	 *
	 * When `exportsAsIndexes` is `false`:
	 * ```text
	 * "./foo/bar" -> "foo-bar"
	 * ```
	 *
	 * @defaultValue `false`
	 */
	exportsAsIndexes?: boolean;
}

/**
 * Result of entry extraction.
 *
 * @internal
 */
export interface ExtractedEntries {
	/**
	 * Entry name to TypeScript source path mapping.
	 *
	 * @remarks
	 * Keys are output bundle names (without extension).
	 * Values are paths to TypeScript source files.
	 *
	 * @example
	 * ```typescript
	 * {
	 *   "index": "./src/index.ts",
	 *   "utils": "./src/utils.ts",
	 *   "bin/cli": "./src/bin/cli.ts"
	 * }
	 * ```
	 */
	entries: Record<string, string>;

	/**
	 * Entry name to original export key mapping.
	 *
	 * @remarks
	 * Maps entry names back to the original package.json export path
	 * (e.g., `"utils"` → `"./utils"`, `"index"` → `"."`).
	 * Bin entries are not included since they are not exports.
	 *
	 * @example
	 * ```typescript
	 * {
	 *   "index": ".",
	 *   "utils": "./utils"
	 * }
	 * ```
	 */
	exportPaths: Record<string, string>;
}

/**
 * Extracts TypeScript entry points from package.json for build configuration.
 *
 * @remarks
 * This class analyzes package.json `exports` and `bin` configurations to identify
 * TypeScript source files that need to be built. It handles various export formats:
 *
 * - String exports: `"./src/index.ts"`
 * - Conditional exports: `{ import: "./src/index.ts", types: "./src/index.d.ts" }`
 * - Subpath exports: `{ "./utils": "./src/utils.ts" }`
 *
 * The extractor automatically maps JavaScript output paths in `dist/` back to
 * their TypeScript source files in `src/`.
 *
 * @example
 * Basic usage:
 * ```typescript
 * import type { PackageJson } from '@savvy-web/bun-builder';
 * import { EntryExtractor } from '@savvy-web/bun-builder';
 *
 * const extractor = new EntryExtractor();
 *
 * const packageJson: PackageJson = {
 *   exports: {
 *     '.': './src/index.ts',
 *     './utils': './src/utils.ts',
 *   },
 *   bin: {
 *     'my-cli': './src/bin/cli.ts',
 *   },
 * };
 *
 * const result = extractor.extract(packageJson);
 * // result.entries = {
 * //   "index": "./src/index.ts",
 * //   "utils": "./src/utils.ts",
 * //   "bin/my-cli": "./src/bin/cli.ts"
 * // }
 * ```
 *
 * @example
 * With exportsAsIndexes option:
 * ```typescript
 * import type { PackageJson } from '@savvy-web/bun-builder';
 * import { EntryExtractor } from '@savvy-web/bun-builder';
 *
 * const extractor = new EntryExtractor({ exportsAsIndexes: true });
 *
 * const packageJson: PackageJson = {
 *   exports: { './foo/bar': './src/foo/bar.ts' },
 * };
 *
 * const result = extractor.extract(packageJson);
 * // result.entries = { "foo/bar/index": "./src/foo/bar.ts" }
 * ```
 *
 * @internal
 */
export class EntryExtractor {
	/**
	 * Extraction options.
	 *
	 * @internal
	 */
	private readonly options: EntryExtractorOptions;

	/**
	 * Creates a new EntryExtractor instance.
	 *
	 * @param options - Extraction configuration options
	 */
	constructor(options: EntryExtractorOptions = {}) {
		this.options = options;
	}

	/**
	 * Extracts entry points from a package.json file.
	 *
	 * @remarks
	 * This static method provides a convenient way to extract entries without
	 * explicitly creating an extractor instance. For repeated extractions with
	 * the same options, consider creating an instance instead.
	 *
	 * @param packageJson - The package.json to extract entries from
	 * @param options - Optional extraction configuration
	 * @returns Object containing the extracted entry point mappings
	 *
	 * @example
	 * ```typescript
	 * import type { PackageJson } from '@savvy-web/bun-builder';
	 * import { EntryExtractor } from '@savvy-web/bun-builder';
	 *
	 * const packageJson: PackageJson = {
	 *   exports: { '.': './src/index.ts' },
	 * };
	 *
	 * const { entries } = EntryExtractor.fromPackageJson(packageJson);
	 * // entries = { "index": "./src/index.ts" }
	 * ```
	 *
	 */
	static fromPackageJson(packageJson: PackageJson, options?: EntryExtractorOptions): ExtractedEntries {
		const extractor = new EntryExtractor(options);
		return extractor.extract(packageJson);
	}

	/**
	 * Extracts entry points from package.json exports and bin fields.
	 *
	 * @remarks
	 * Processes the `exports` field first, then the `bin` field.
	 * JSON exports (like `"./package.json"`) are automatically skipped.
	 *
	 * @param packageJson - The package.json to extract entries from
	 * @returns Object containing the extracted entry point mappings
	 */
	extract(packageJson: PackageJson): ExtractedEntries {
		const entries: Record<string, string> = {};
		const exportPaths: Record<string, string> = {};

		this.extractFromExports(packageJson.exports, entries, exportPaths);
		this.extractFromBin(packageJson.bin, entries);

		return { entries, exportPaths };
	}

	/**
	 * Extracts entries from the exports field.
	 */
	private extractFromExports(
		exports: PackageJson["exports"],
		entries: Record<string, string>,
		exportPaths: Record<string, string>,
	): void {
		if (!exports) return;

		if (typeof exports === "string") {
			if (this.isTypeScriptFile(exports)) {
				entries.index = exports;
				exportPaths.index = ".";
			}
			return;
		}

		if (typeof exports !== "object") return;

		for (const [key, value] of Object.entries(exports)) {
			// Skip package.json and JSON exports
			if (key === "./package.json" || key.endsWith(".json")) {
				continue;
			}

			const sourcePath = this.resolveSourcePath(value);
			if (!sourcePath) continue;

			const resolvedPath = this.resolveToTypeScript(sourcePath);
			if (!this.isTypeScriptFile(resolvedPath)) continue;

			const entryName = this.createEntryName(key);
			entries[entryName] = resolvedPath;
			exportPaths[entryName] = key;
		}
	}

	/**
	 * Extracts entries from the bin field.
	 */
	private extractFromBin(bin: PackageJson["bin"], entries: Record<string, string>): void {
		if (!bin) return;

		if (typeof bin === "string") {
			const resolvedPath = this.resolveToTypeScript(bin);
			if (this.isTypeScriptFile(resolvedPath)) {
				entries["bin/cli"] = resolvedPath;
			}
			return;
		}

		if (typeof bin !== "object") return;

		for (const [command, path] of Object.entries(bin)) {
			if (typeof path !== "string") continue;

			const resolvedPath = this.resolveToTypeScript(path);
			if (this.isTypeScriptFile(resolvedPath)) {
				entries[`bin/${command}`] = resolvedPath;
			}
		}
	}

	/**
	 * Resolves a source path from various export value formats.
	 */
	private resolveSourcePath(value: unknown): string | undefined {
		if (typeof value === "string") {
			return value;
		}

		if (value && typeof value === "object") {
			const exportObj = value as Record<string, unknown>;
			return (exportObj.import as string) || (exportObj.default as string) || (exportObj.types as string);
		}

		return undefined;
	}

	/**
	 * Resolves a path to its TypeScript source equivalent.
	 */
	private resolveToTypeScript(path: string): string {
		if (path.endsWith(".js") && path.includes("/dist/")) {
			return path.replace("/dist/", "/src/").replace(/\.js$/, ".ts");
		}
		return path;
	}

	/**
	 * Checks if a path points to a TypeScript file.
	 */
	private isTypeScriptFile(path: string): boolean {
		return path.endsWith(".ts") || path.endsWith(".tsx");
	}

	/**
	 * Creates an entry name from an export key.
	 */
	private createEntryName(exportKey: string): string {
		if (exportKey === ".") {
			return "index";
		}

		const withoutPrefix = exportKey.replace(/^\.\//, "");

		if (this.options.exportsAsIndexes) {
			return `${withoutPrefix}/index`;
		}

		return withoutPrefix.replace(/\//g, "-");
	}
}
