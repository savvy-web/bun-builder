/**
 * Package.json transformation utilities for build output.
 *
 * @remarks
 * This module provides utilities for transforming package.json files
 * for build output. Transformations include:
 *
 * - Converting TypeScript paths to JavaScript paths
 * - Stripping source directory prefixes
 * - Adding type declaration paths
 * - Resolving catalog and workspace references
 * - Sorting the final output
 *
 * @packageDocumentation
 */

import sortPkg from "sort-package-json";
import type { PackageJson } from "../../types/package-json.js";
import { getDefaultCatalogResolver } from "./catalog-resolver.js";

/**
 * Flexible type for package.json exports field.
 *
 * @remarks
 * Supports all valid export field formats including strings, objects,
 * arrays, and nested conditional exports.
 *
 * @public
 */
export type FlexibleExports = PackageJson.Exports | Record<string, unknown> | FlexibleExports[] | undefined | null;

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
 * import { transformExportPath } from '@savvy-web/bun-builder';
 *
 * transformExportPath('./src/index.ts');          // "./index.js"
 * transformExportPath('./src/utils/index.ts', true, true); // "./utils.js"
 * ```
 *
 * @public
 */
export function transformExportPath(
	path: string,
	processTSExports: boolean = true,
	collapseIndex: boolean = false,
): string {
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
 * import { createTypePath } from '@savvy-web/bun-builder';
 *
 * createTypePath('./index.js');             // "./index.d.ts"
 * createTypePath('./utils/index.js', true); // "./utils.d.ts"
 * createTypePath('./utils/index.js', false); // "./utils/index.d.ts"
 * ```
 *
 * @public
 */
export function createTypePath(jsPath: string, collapseIndex: boolean = true): string {
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
 * import { transformPackageBin } from '@savvy-web/bun-builder';
 *
 * transformPackageBin('./src/cli.ts');
 * // Returns: "./bin/cli.js"
 *
 * transformPackageBin({ 'my-cli': './src/bin/cli.ts' });
 * // Returns: { 'my-cli': './bin/my-cli.js' }
 * ```
 *
 * @public
 */
export function transformPackageBin(bin: PackageJson["bin"]): PackageJson["bin"] {
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
 * Checks if an export object contains export conditions.
 *
 * @remarks
 * Detects conditional export objects by checking for standard condition keys:
 * `import`, `require`, `types`, or `default`.
 *
 * @param exports - The export object to check
 * @returns `true` if the object contains condition keys
 *
 * @internal
 */
export function isConditionsObject(exports: Record<string, unknown>): boolean {
	return Object.keys(exports).some(
		(key) => key === "import" || key === "require" || key === "types" || key === "default",
	);
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
 * import { transformPackageExports } from '@savvy-web/bun-builder';
 *
 * // String export
 * transformPackageExports('./src/index.ts');
 * // Returns: { types: "./index.d.ts", import: "./index.js" }
 *
 * // Subpath exports
 * transformPackageExports({
 *   '.': './src/index.ts',
 *   './utils': './src/utils.ts',
 * });
 * ```
 *
 * @public
 */
export function transformPackageExports(
	exports: FlexibleExports,
	processTSExports: boolean = true,
	exportKey?: string,
	collapseIndex: boolean = false,
): FlexibleExports {
	if (typeof exports === "string") {
		return transformStringExport(exports, processTSExports, collapseIndex);
	}

	if (Array.isArray(exports)) {
		return exports.map((item) =>
			transformPackageExports(item as FlexibleExports, processTSExports, exportKey, collapseIndex),
		);
	}

	if (exports && typeof exports === "object") {
		return transformObjectExports(exports as Record<string, unknown>, processTSExports, exportKey, collapseIndex);
	}

	return exports;
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
function transformStringExport(
	exportString: string,
	processTSExports: boolean,
	collapseIndex: boolean,
): FlexibleExports {
	const transformedPath = transformExportPath(exportString, processTSExports, collapseIndex);

	if (
		processTSExports &&
		(exportString.endsWith(".ts") || exportString.endsWith(".tsx")) &&
		!exportString.endsWith(".d.ts")
	) {
		return {
			types: createTypePath(transformedPath, collapseIndex),
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
function transformObjectExports(
	exportsObject: Record<string, unknown>,
	processTSExports: boolean,
	exportKey?: string,
	collapseIndex: boolean = false,
): Record<string, unknown> {
	const transformed: Record<string, unknown> = {};
	const isConditions = isConditionsObject(exportsObject);

	for (const [key, value] of Object.entries(exportsObject)) {
		if (isConditions && (key === "import" || key === "require" || key === "types" || key === "default")) {
			if (typeof value === "string") {
				transformed[key] = transformExportPath(value, processTSExports, collapseIndex);
			} else if (value !== undefined && value !== null) {
				transformed[key] = transformPackageExports(
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
				transformed[key] = transformPackageExports(value as FlexibleExports, processTSExports, key, collapseIndex);
			} else {
				transformed[key] = value;
			}
		}
	}

	return transformed;
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
 * @public
 */
export function applyBuildTransformations(
	packageJson: PackageJson,
	originalPackageJson: PackageJson,
	processTSExports: boolean = true,
	bundle?: boolean,
): PackageJson {
	const { publishConfig, scripts, ...rest } = packageJson;

	let isPrivate = true;
	if (originalPackageJson.publishConfig?.access === "public") {
		isPrivate = false;
	}

	const processedManifest = {
		...rest,
		private: isPrivate,
	} as PackageJson;

	if (processedManifest.exports) {
		processedManifest.exports = transformPackageExports(
			processedManifest.exports,
			processTSExports,
			undefined,
			bundle ?? false,
		) as PackageJson.Exports;
	}

	if (processedManifest.bin) {
		processedManifest.bin = transformPackageBin(processedManifest.bin);
	}

	if (originalPackageJson.typesVersions) {
		const transformedTypesVersions: Record<string, Record<string, string[]>> = {};

		for (const [version, paths] of Object.entries(originalPackageJson.typesVersions)) {
			const transformedPaths: Record<string, string[]> = {};

			for (const [key, value] of Object.entries(paths as Record<string, string[]>)) {
				transformedPaths[key] = value.map((path) => transformExportPath(path, processTSExports, bundle ?? false));
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
 * import type { PackageJson } from '@savvy-web/bun-builder';
 * import { resolveCatalogReferences } from '@savvy-web/bun-builder';
 *
 * const pkg: PackageJson = {
 *   dependencies: { 'react': 'catalog:' },
 * };
 *
 * const resolved = await resolveCatalogReferences(pkg);
 * // resolved.dependencies.react = "^19.0.0"
 * ```
 *
 * @public
 */
export async function resolveCatalogReferences(
	packageJson: PackageJson,
	dir: string = process.cwd(),
): Promise<PackageJson> {
	const resolver = getDefaultCatalogResolver();
	return resolver.resolvePackageJson(packageJson, dir);
}

/**
 * Performs complete package.json transformation for build output.
 *
 * @remarks
 * This is the main transformation function that orchestrates all package.json
 * modifications for build output:
 *
 * 1. Resolves catalog references (production only)
 * 2. Applies build transformations (paths, exports, etc.)
 * 3. Applies user-provided transform function (if any)
 *
 * @param packageJson - The source package.json
 * @param isProduction - Whether this is a production build (resolves catalogs)
 * @param processTSExports - Whether to process TypeScript exports
 * @param bundle - Whether the build is in bundle mode (collapses index files)
 * @param transform - Optional custom transform function for final modifications
 * @returns Promise resolving to the fully transformed package.json
 *
 * @example
 * ```typescript
 * import type { PackageJson } from '@savvy-web/bun-builder';
 * import { buildPackageJson } from '@savvy-web/bun-builder';
 *
 * const pkg: PackageJson = {
 *   name: 'my-package',
 *   exports: { '.': './src/index.ts' },
 * };
 *
 * const transformed = await buildPackageJson(pkg, true, true, true);
 * ```
 *
 * @public
 */
export async function buildPackageJson(
	packageJson: PackageJson,
	isProduction: boolean = false,
	processTSExports: boolean = true,
	bundle?: boolean,
	transform?: (pkg: PackageJson) => PackageJson,
): Promise<PackageJson> {
	let result: PackageJson;

	if (isProduction) {
		const resolved = await resolveCatalogReferences(packageJson);
		result = applyBuildTransformations(resolved, packageJson, processTSExports, bundle);
	} else {
		result = applyBuildTransformations(packageJson, packageJson, processTSExports, bundle);
	}

	if (transform) {
		result = transform(result);
	}

	return result;
}
