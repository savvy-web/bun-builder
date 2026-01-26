import type { PackageJson } from "type-fest";

/**
 * Options for entry extraction.
 * @public
 */
export interface EntryExtractorOptions {
	/**
	 * When true, export paths create index files in nested directories.
	 * "./foo/bar" becomes "foo/bar/index" instead of "foo-bar".
	 */
	exportsAsIndexes?: boolean;
}

/**
 * Result of entry extraction.
 * @public
 */
export interface ExtractedEntries {
	/**
	 * Entry name to TypeScript source path mapping.
	 */
	entries: Record<string, string>;
}

/**
 * Extracts TypeScript entry points from package.json for build configuration.
 *
 * @remarks
 * This class analyzes package.json export and bin configurations to identify
 * TypeScript source files that need to be built. It handles various export
 * formats and automatically maps JavaScript output paths back to their
 * TypeScript source files.
 *
 * **Export Path Mapping:**
 * - Converts export keys to entry names (e.g., "./utils" becomes "utils")
 * - Maps the root export "." to "index" entry
 * - Replaces path separators with hyphens for nested exports (default)
 * - When `exportsAsIndexes` is true, preserves path structure
 *
 * **Source Path Resolution:**
 * - Prioritizes TypeScript files (.ts/.tsx) over JavaScript files
 * - Maps /dist/ JavaScript paths back to /src/ TypeScript sources
 * - Supports conditional exports (import, default, types fields)
 *
 * @example
 * ```typescript
 * const extractor = new EntryExtractor();
 *
 * const packageJson = {
 *   exports: {
 *     ".": "./src/index.ts",
 *     "./utils": "./src/utils.ts",
 *   },
 *   bin: {
 *     "my-cli": "./src/bin/cli.ts"
 *   }
 * };
 *
 * const result = extractor.extract(packageJson);
 * console.log(result.entries);
 * // {
 * //   "index": "./src/index.ts",
 * //   "utils": "./src/utils.ts",
 * //   "bin/my-cli": "./src/bin/cli.ts"
 * // }
 * ```
 *
 * @public
 */
export class EntryExtractor {
	private readonly options: EntryExtractorOptions;

	constructor(options: EntryExtractorOptions = {}) {
		this.options = options;
	}

	/**
	 * Extracts entry points from package.json exports and bin fields.
	 *
	 * @param packageJson - The package.json to extract entries from
	 * @returns Object containing the extracted entries
	 */
	extract(packageJson: PackageJson): ExtractedEntries {
		const entries: Record<string, string> = {};

		this.extractFromExports(packageJson.exports, entries);
		this.extractFromBin(packageJson.bin, entries);

		return { entries };
	}

	/**
	 * Extracts entries from the exports field.
	 */
	private extractFromExports(exports: PackageJson["exports"], entries: Record<string, string>): void {
		if (!exports) return;

		if (typeof exports === "string") {
			if (this.isTypeScriptFile(exports)) {
				entries.index = exports;
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
	 * Maps /dist/ JavaScript paths back to /src/ TypeScript sources.
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

/**
 * Extracts TypeScript entry points from package.json (functional interface).
 *
 * @remarks
 * This is a convenience function that creates an EntryExtractor instance
 * and extracts entries in one call. For repeated use, consider creating
 * an EntryExtractor instance directly.
 *
 * @param packageJson - The package.json object to extract entries from
 * @param options - Configuration options for entry extraction
 * @returns Object containing the extracted entries
 *
 * @public
 */
export function extractEntriesFromPackageJson(
	packageJson: PackageJson,
	options?: EntryExtractorOptions,
): ExtractedEntries {
	const extractor = new EntryExtractor(options);
	return extractor.extract(packageJson);
}
