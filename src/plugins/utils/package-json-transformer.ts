/**
 * Package.json transformation utilities for build output.
 *
 * @remarks
 * This module provides the {@link PackageJsonTransformer} class for transforming
 * package.json files for build output. Transformations include:
 *
 * - Converting TypeScript paths to JavaScript paths
 * - Stripping source directory prefixes
 * - Adding type declaration paths
 * - Resolving catalog and workspace references
 * - Sorting the final output
 *
 */

import sortPkg from "sort-package-json";
import type { PackageJson } from "../../types/package-json.js";
import { BunCatalogResolver } from "./catalog-resolver.js";

/**
 * Flexible type for package.json exports field.
 *
 * @remarks
 * Supports all valid export field formats including strings, objects,
 * arrays, and nested conditional exports.
 *
 * @internal
 */
export type FlexibleExports = PackageJson.Exports | Record<string, unknown> | FlexibleExports[] | undefined | null;

/**
 * Utilities for transforming package.json files for build output.
 *
 * @remarks
 * This class provides static methods for all package.json transformation operations
 * needed during the build process. It handles:
 *
 * - Export path transformation (TypeScript to JavaScript)
 * - Type declaration path generation
 * - Bin field transformation
 * - Catalog and workspace reference resolution
 * - Complete build transformations with sorting
 *
 * @example
 * Transform export paths:
 * ```typescript
 * import { PackageJsonTransformer } from '@savvy-web/bun-builder';
 *
 * const jsPath = PackageJsonTransformer.transformExportPath('./src/index.ts');
 * // Returns: "./index.js"
 *
 * const dtsPath = PackageJsonTransformer.createTypePath('./index.js');
 * // Returns: "./index.d.ts"
 * ```
 *
 * @example
 * Complete package.json transformation:
 * ```typescript
 * import { PackageJsonTransformer } from '@savvy-web/bun-builder';
 * import type { PackageJson } from '@savvy-web/bun-builder';
 *
 * const pkg: PackageJson = {
 *   name: 'my-package',
 *   exports: { '.': './src/index.ts' },
 * };
 *
 * const transformed = await PackageJsonTransformer.build(pkg, {
 *   isProduction: true,
 *   processTSExports: true,
 *   bundle: true,
 * });
 * ```
 *
 * @internal
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Intentional static-only class for API organization
export class PackageJsonTransformer {
	/**
	 * Transforms a single export path for build output compatibility.
	 *
	 * @remarks
	 * Applies the following transformations:
	 * - Strips `./src/`, `./exports/`, and `./public/` prefixes
	 * - Converts `.ts` and `.tsx` extensions to `.js`
	 * - Optionally collapses `/index.ts` to `.js` (bundle mode)
	 *
	 * @param path - The file path to transform
	 * @param processTSExports - Whether to process TypeScript extensions
	 * @param collapseIndex - Whether to collapse index files (bundled mode)
	 * @returns The transformed path
	 *
	 * @example
	 * ```typescript
	 * import { PackageJsonTransformer } from '@savvy-web/bun-builder';
	 *
	 * PackageJsonTransformer.transformExportPath('./src/index.ts');
	 * // Returns: "./index.js"
	 *
	 * PackageJsonTransformer.transformExportPath('./src/utils/index.ts', true, true);
	 * // Returns: "./utils.js"
	 * ```
	 */
	static transformExportPath(path: string, processTSExports: boolean = true, collapseIndex: boolean = false): string {
		let transformedPath = path;

		// Strip source directory prefixes
		if (transformedPath.startsWith("./src/")) {
			transformedPath = `./${transformedPath.slice("./src/".length)}`;
		}
		if (transformedPath.startsWith("./exports/")) {
			transformedPath = `./${transformedPath.slice("./exports/".length)}`;
		}
		if (transformedPath.startsWith("./public/")) {
			transformedPath = `./${transformedPath.slice("./public/".length)}`;
		}

		if (processTSExports) {
			if (collapseIndex && transformedPath.endsWith("/index.ts") && transformedPath !== "./index.ts") {
				transformedPath = `${transformedPath.slice(0, -"/index.ts".length)}.js`;
			} else if (collapseIndex && transformedPath.endsWith("/index.tsx") && transformedPath !== "./index.tsx") {
				transformedPath = `${transformedPath.slice(0, -"/index.tsx".length)}.js`;
			} else if (transformedPath.endsWith(".tsx")) {
				transformedPath = `${transformedPath.slice(0, -4)}.js`;
			} else if (transformedPath.endsWith(".ts") && !transformedPath.endsWith(".d.ts")) {
				transformedPath = `${transformedPath.slice(0, -3)}.js`;
			}
		}

		return transformedPath;
	}

	/**
	 * Creates a TypeScript declaration file path from a JavaScript file path.
	 *
	 * @remarks
	 * Converts `.js` extension to `.d.ts`. When `collapseIndex` is true,
	 * `/index.js` paths are collapsed to just `.d.ts`.
	 *
	 * @param jsPath - The JavaScript file path
	 * @param collapseIndex - Whether to collapse `/index.js` to `.d.ts`
	 * @returns The corresponding declaration file path
	 *
	 * @example
	 * ```typescript
	 * import { PackageJsonTransformer } from '@savvy-web/bun-builder';
	 *
	 * PackageJsonTransformer.createTypePath('./index.js');
	 * // Returns: "./index.d.ts"
	 *
	 * PackageJsonTransformer.createTypePath('./utils/index.js', true);
	 * // Returns: "./utils.d.ts"
	 *
	 * PackageJsonTransformer.createTypePath('./utils/index.js', false);
	 * // Returns: "./utils/index.d.ts"
	 * ```
	 */
	static createTypePath(jsPath: string, collapseIndex: boolean = true): string {
		if (collapseIndex && jsPath.endsWith("/index.js") && jsPath !== "./index.js") {
			return `${jsPath.slice(0, -"/index.js".length)}.d.ts`;
		}

		if (jsPath.endsWith(".js")) {
			return `${jsPath.slice(0, -3)}.d.ts`;
		}
		return `${jsPath}.d.ts`;
	}

	/**
	 * Transforms the package.json bin field for build output.
	 *
	 * @remarks
	 * Converts TypeScript bin paths to their JavaScript output equivalents.
	 * Preserves the structure (string or object) of the original bin field.
	 *
	 * @param bin - The bin field value from package.json
	 * @returns The transformed bin field with JavaScript paths
	 *
	 * @example
	 * ```typescript
	 * import { PackageJsonTransformer } from '@savvy-web/bun-builder';
	 *
	 * PackageJsonTransformer.transformBin('./src/cli.ts');
	 * // Returns: "./bin/cli.js"
	 *
	 * PackageJsonTransformer.transformBin({ 'my-cli': './src/bin/cli.ts' });
	 * // Returns: { 'my-cli': './bin/my-cli.js' }
	 * ```
	 */
	static transformBin(bin: NonNullable<PackageJson["bin"]>): NonNullable<PackageJson["bin"]> {
		if (typeof bin === "string") {
			if (bin.endsWith(".ts") || bin.endsWith(".tsx")) {
				return "./bin/cli.js";
			}
			return bin;
		}

		if (bin && typeof bin === "object") {
			const transformed: Record<string, string> = {};
			for (const [command, path] of Object.entries(bin)) {
				if (path !== undefined) {
					if (path.endsWith(".ts") || path.endsWith(".tsx")) {
						transformed[command] = `./bin/${command}.js`;
					} else {
						transformed[command] = path;
					}
				}
			}
			return transformed;
		}

		return bin;
	}

	/**
	 * Recursively transforms package.json exports field.
	 *
	 * @remarks
	 * Handles all export field formats:
	 * - String exports are transformed to conditional exports with types
	 * - Array exports are recursively processed
	 * - Object exports with conditions are transformed in place
	 * - Subpath exports are recursively processed
	 *
	 * @param exports - The exports value to transform
	 * @param processTSExports - Whether to process TypeScript extensions
	 * @param exportKey - The export key for context (used internally)
	 * @param collapseIndex - Whether to collapse index files (bundle mode)
	 * @returns The transformed exports value
	 *
	 * @example
	 * ```typescript
	 * import { PackageJsonTransformer } from '@savvy-web/bun-builder';
	 *
	 * // String export
	 * PackageJsonTransformer.transformExports('./src/index.ts');
	 * // Returns: { types: "./index.d.ts", import: "./index.js" }
	 *
	 * // Subpath exports
	 * PackageJsonTransformer.transformExports({
	 *   '.': './src/index.ts',
	 *   './utils': './src/utils.ts',
	 * });
	 * ```
	 */
	static transformExports(
		exports: FlexibleExports,
		processTSExports: boolean = true,
		exportKey?: string,
		collapseIndex: boolean = false,
	): FlexibleExports {
		if (typeof exports === "string") {
			return PackageJsonTransformer.transformStringExport(exports, processTSExports, collapseIndex);
		}

		if (Array.isArray(exports)) {
			return exports.map((item) =>
				PackageJsonTransformer.transformExports(item as FlexibleExports, processTSExports, exportKey, collapseIndex),
			);
		}

		if (exports && typeof exports === "object") {
			return PackageJsonTransformer.transformObjectExports(
				exports as Record<string, unknown>,
				processTSExports,
				exportKey,
				collapseIndex,
			);
		}

		return exports;
	}

	/**
	 * Applies build-specific transformations to package.json.
	 *
	 * @remarks
	 * Performs the following transformations:
	 * - Removes `publishConfig` and `scripts` fields
	 * - Sets `private` based on original `publishConfig.access`
	 * - Transforms `exports` field with JavaScript paths
	 * - Transforms `bin` field with JavaScript paths
	 * - Transforms `typesVersions` paths
	 * - Transforms `files` array paths
	 * - Sorts the result using sort-package-json
	 *
	 * @param packageJson - The package.json to transform
	 * @param originalPackageJson - The original source package.json (for reference)
	 * @param processTSExports - Whether to process TypeScript exports
	 * @param bundle - Whether the build is in bundle mode (collapses index files)
	 * @returns The transformed and sorted package.json
	 *
	 * @example
	 * ```typescript
	 * import { PackageJsonTransformer } from '@savvy-web/bun-builder';
	 * import type { PackageJson } from '@savvy-web/bun-builder';
	 *
	 * const pkg: PackageJson = {
	 *   name: 'my-package',
	 *   exports: { '.': './src/index.ts' },
	 *   scripts: { build: 'bun run build' },
	 * };
	 *
	 * const transformed = PackageJsonTransformer.applyBuildTransformations(pkg, pkg, true, true);
	 * // scripts field is removed, exports are transformed
	 * ```
	 */
	static applyBuildTransformations(
		packageJson: PackageJson,
		originalPackageJson: PackageJson,
		processTSExports: boolean = true,
		bundle?: boolean,
		format?: "esm" | "cjs",
	): PackageJson {
		const { publishConfig, scripts, ...rest } = packageJson;

		let isPrivate = true;
		if (originalPackageJson.publishConfig?.access === "public") {
			isPrivate = false;
		}

		const processedManifest = {
			...rest,
			private: isPrivate,
			type: format === "cjs" ? "commonjs" : "module",
		} as PackageJson;

		if (processedManifest.exports) {
			processedManifest.exports = PackageJsonTransformer.transformExports(
				processedManifest.exports,
				processTSExports,
				undefined,
				bundle ?? false,
			) as PackageJson.Exports;
		}

		if (processedManifest.bin) {
			processedManifest.bin = PackageJsonTransformer.transformBin(processedManifest.bin);
		}

		if (originalPackageJson.typesVersions) {
			const transformedTypesVersions: Record<string, Record<string, string[]>> = {};

			for (const [version, paths] of Object.entries(originalPackageJson.typesVersions)) {
				const transformedPaths: Record<string, string[]> = {};

				for (const [key, value] of Object.entries(paths as Record<string, string[]>)) {
					transformedPaths[key] = value.map((path) =>
						PackageJsonTransformer.transformExportPath(path, processTSExports, bundle ?? false),
					);
				}

				transformedTypesVersions[version] = transformedPaths;
			}

			processedManifest.typesVersions = transformedTypesVersions;
		}

		if (originalPackageJson.files) {
			processedManifest.files = originalPackageJson.files.map((file) => {
				let transformedFile = file.startsWith("./") ? file.slice(2) : file;
				if (transformedFile.startsWith("public/")) {
					transformedFile = transformedFile.slice("public/".length);
				}
				return transformedFile;
			});
		}

		return sortPkg(processedManifest);
	}

	/**
	 * Resolves `catalog:` and `workspace:` references in a package.json.
	 *
	 * @remarks
	 * Uses the {@link BunCatalogResolver} to convert Bun-specific dependency
	 * version references to concrete version strings suitable for npm publishing.
	 *
	 * @param packageJson - The source package.json with catalog references
	 * @param dir - The directory containing the package (for workspace root detection)
	 * @returns Promise resolving to the package.json with resolved versions
	 *
	 * @example
	 * ```typescript
	 * import { PackageJsonTransformer } from '@savvy-web/bun-builder';
	 * import type { PackageJson } from '@savvy-web/bun-builder';
	 *
	 * const pkg: PackageJson = {
	 *   name: 'my-package',
	 *   dependencies: { 'react': 'catalog:' },
	 * };
	 *
	 * const resolved = await PackageJsonTransformer.resolveCatalogReferences(pkg);
	 * // resolved.dependencies.react = "^19.0.0"
	 * ```
	 */
	static async resolveCatalogReferences(packageJson: PackageJson, dir: string = process.cwd()): Promise<PackageJson> {
		const resolver = BunCatalogResolver.getDefault();
		return resolver.resolvePackageJson(packageJson, dir);
	}

	/**
	 * Performs complete package.json transformation for build output.
	 *
	 * @remarks
	 * This is the main transformation method that orchestrates all package.json
	 * modifications for build output:
	 *
	 * 1. Resolves catalog references (production only)
	 * 2. Applies build transformations (paths, exports, etc.)
	 * 3. Applies user-provided transform function (if any)
	 *
	 * @param packageJson - The source package.json
	 * @param options - Build options
	 * @returns Promise resolving to the fully transformed package.json
	 *
	 * @example
	 * ```typescript
	 * import { PackageJsonTransformer } from '@savvy-web/bun-builder';
	 * import type { PackageJson } from '@savvy-web/bun-builder';
	 *
	 * const pkg: PackageJson = {
	 *   name: 'my-package',
	 *   exports: { '.': './src/index.ts' },
	 * };
	 *
	 * const transformed = await PackageJsonTransformer.build(pkg, {
	 *   isProduction: true,
	 *   processTSExports: true,
	 *   bundle: true,
	 * });
	 * ```
	 */
	static async build(
		packageJson: PackageJson,
		options: {
			isProduction?: boolean;
			processTSExports?: boolean;
			bundle?: boolean;
			format?: "esm" | "cjs";
			transform?: (pkg: PackageJson) => PackageJson;
		} = {},
	): Promise<PackageJson> {
		const { isProduction = false, processTSExports = true, bundle, format, transform } = options;

		let result: PackageJson;

		if (isProduction) {
			const resolved = await PackageJsonTransformer.resolveCatalogReferences(packageJson);
			result = PackageJsonTransformer.applyBuildTransformations(
				resolved,
				packageJson,
				processTSExports,
				bundle,
				format,
			);
		} else {
			result = PackageJsonTransformer.applyBuildTransformations(
				packageJson,
				packageJson,
				processTSExports,
				bundle,
				format,
			);
		}

		if (transform) {
			result = transform(result);
		}

		return result;
	}

	/**
	 * Checks if an export object contains export conditions.
	 *
	 * @remarks
	 * Detects conditional export objects by checking for standard condition keys:
	 * `import`, `require`, `types`, or `default`.
	 *
	 * @param exports - The export object to check
	 * @returns `true` if the object contains condition keys
	 */
	static isConditionsObject(exports: Record<string, unknown>): boolean {
		return Object.keys(exports).some(
			(key) => key === "import" || key === "require" || key === "types" || key === "default",
		);
	}

	/**
	 * Transforms string-based export values.
	 *
	 * @remarks
	 * For TypeScript files, generates a conditional export object with
	 * both `types` and `import` fields. Non-TypeScript paths are returned
	 * as-is after applying path transformations.
	 *
	 * @internal
	 */
	private static transformStringExport(
		exportString: string,
		processTSExports: boolean,
		collapseIndex: boolean,
	): FlexibleExports {
		const transformedPath = PackageJsonTransformer.transformExportPath(exportString, processTSExports, collapseIndex);

		if (
			processTSExports &&
			(exportString.endsWith(".ts") || exportString.endsWith(".tsx")) &&
			!exportString.endsWith(".d.ts")
		) {
			return {
				types: PackageJsonTransformer.createTypePath(transformedPath, collapseIndex),
				import: transformedPath,
			};
		}

		return transformedPath;
	}

	/**
	 * Transforms object exports (conditional or subpath).
	 *
	 * @remarks
	 * Handles both conditional exports (`import`, `require`, `types`, `default`)
	 * and subpath exports (keys starting with `.`).
	 *
	 * @internal
	 */
	private static transformObjectExports(
		exportsObject: Record<string, unknown>,
		processTSExports: boolean,
		exportKey?: string,
		collapseIndex: boolean = false,
	): Record<string, unknown> {
		const transformed: Record<string, unknown> = {};
		const isConditions = PackageJsonTransformer.isConditionsObject(exportsObject);

		for (const [key, value] of Object.entries(exportsObject)) {
			if (isConditions && (key === "import" || key === "require" || key === "types" || key === "default")) {
				if (typeof value === "string") {
					transformed[key] = PackageJsonTransformer.transformExportPath(value, processTSExports, collapseIndex);
				} else if (value !== undefined && value !== null) {
					transformed[key] = PackageJsonTransformer.transformExports(
						value as FlexibleExports,
						processTSExports,
						exportKey,
						collapseIndex,
					);
				} else {
					transformed[key] = value;
				}
			} else {
				if (value !== undefined && value !== null) {
					transformed[key] = PackageJsonTransformer.transformExports(
						value as FlexibleExports,
						processTSExports,
						key,
						collapseIndex,
					);
				} else {
					transformed[key] = value;
				}
			}
		}

		return transformed;
	}
}
