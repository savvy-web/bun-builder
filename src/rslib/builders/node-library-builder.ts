import { existsSync } from "node:fs";
import { join } from "node:path";
import type { RsbuildPlugin, SourceConfig } from "@rsbuild/core";
import type { ConfigParams, LibConfig, RslibConfig } from "@rslib/core";
import { defineConfig } from "@rslib/core";
import type { RawCopyPattern } from "@rspack/binding";
import type { PackageJson } from "type-fest";
import { AutoEntryPlugin } from "../plugins/auto-entry-plugin.js";
import type { ApiModelOptions } from "../plugins/dts-plugin.js";
import { DtsPlugin } from "../plugins/dts-plugin.js";
import { FilesArrayPlugin } from "../plugins/files-array-plugin.js";
import { PackageJsonTransformPlugin } from "../plugins/package-json-transform-plugin.js";
import type { TsDocLintPluginOptions } from "../plugins/tsdoc-lint-plugin.js";
import { TsDocLintPlugin } from "../plugins/tsdoc-lint-plugin.js";
import { packageJsonVersion } from "../plugins/utils/file-utils.js";

/**
 * Async RSLib configuration function type.
 * @public
 */
export type RslibConfigAsyncFn = (env: ConfigParams) => Promise<RslibConfig>;

/**
 * Build target environment for library output.
 *
 * @remarks
 * Each target produces different output optimizations:
 * - `"dev"`: Development build with source maps for debugging
 * - `"npm"`: Production build optimized for npm publishing
 *
 * @example
 * Specifying targets via CLI:
 * ```bash
 * rslib build --env-mode dev
 * rslib build --env-mode npm
 * ```
 *
 * @public
 */
export type BuildTarget = "dev" | "npm";

/**
 * Function to transform package.json during the build process.
 *
 * @remarks
 * This function is called after all standard transformations are applied,
 * allowing you to modify the package.json before it's written to the output directory.
 * Mutations to the `pkg` object are also supported.
 *
 * @param context - Transform context containing:
 *   - `target`: The current build target ("dev" or "npm")
 *   - `pkg`: The package.json object to transform
 * @returns The modified package.json object
 *
 * @example
 * ```typescript
 * import type { TransformPackageJsonFn } from '@savvy-web/rslib-builder';
 *
 * const transform: TransformPackageJsonFn = ({ target, pkg }) => {
 *   if (target === 'npm') {
 *     delete pkg.devDependencies;
 *     delete pkg.scripts;
 *   }
 *   return pkg;
 * };
 * ```
 * @public
 */
export type TransformPackageJsonFn = (context: { target: BuildTarget; pkg: PackageJson }) => PackageJson;

/**
 * @public
 */
export interface NodeLibraryBuilderOptions {
	/** Override entry points (optional - will auto-detect from package.json) */
	entry?: Record<string, string | string[]>;
	/**
	 * When enabled, each export path will generate an index.js file in a directory
	 * structure matching the export path, rather than using the export name as the filename.
	 *
	 * @example
	 * When `exportsAsIndexes` is `true`, given this package.json configuration:
	 * ```json
	 * {
	 *   "exports": {
	 *     ".": "./src/entrypoint.ts",
	 *     "./foo/bar": "./src/foo/bar.ts",
	 *     "./foo/baz": "./src/foo/baz.ts"
	 *   }
	 * }
	 * ```
	 *
	 * You would get this output file structure:
	 * ```
	 * dist/
	 *   index.js
	 *   foo/
	 *     bar/
	 *       index.js
	 *     baz/
	 *       index.js
	 * ```
	 */
	exportsAsIndexes?: boolean;
	copyPatterns: (string | (Pick<RawCopyPattern, "from"> & Partial<Omit<RawCopyPattern, "from">>))[];
	/** Additional plugins */
	plugins: RsbuildPlugin[];
	define: SourceConfig["define"];
	/** Path to tsconfig for build (default: ./tsconfig.build.json) */
	tsconfigPath: string | undefined;
	/** Build targets to include (default: ["dev", "npm"]) */
	targets?: BuildTarget[];
	/**
	 * External dependencies that should not be bundled.
	 * These modules will be imported at runtime instead of being included in the bundle.
	 *
	 * @remarks
	 * This is useful for dependencies that are in devDependencies but needed at runtime,
	 * such as build tools that the package uses to build other packages.
	 *
	 * @example
	 * ```typescript
	 * import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';
	 *
	 * export default NodeLibraryBuilder.create({
	 *   externals: ['@rslib/core', '@rsbuild/core'],
	 * });
	 * ```
	 */
	externals?: (string | RegExp)[];
	/**
	 * Packages whose type declarations should be bundled into the output .d.ts files.
	 *
	 * @remarks
	 * By default, RSlib bundles types from packages in package.json. Use this to explicitly
	 * specify which packages (including transitive dependencies) should have their types bundled.
	 * This is particularly useful for ensuring devDependencies are fully inlined without external imports.
	 *
	 * Supports minimatch patterns (e.g., '\@pnpm/**', 'picocolors')
	 *
	 * @example
	 * ```typescript
	 * import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';
	 *
	 * export default NodeLibraryBuilder.create({
	 *   dtsBundledPackages: ['@pnpm/lockfile.types', '@pnpm/types', 'picocolors'],
	 * });
	 * ```
	 */
	dtsBundledPackages?: string[];
	/**
	 * Optional callback to transform files after they're built but before the files array is finalized.
	 * Useful for copying/renaming files or adding additional files to the build output.
	 *
	 * @param context - Transform context with properties:
	 *   - `compilation`: Rspack compilation object with assets
	 *   - `filesArray`: Set of files that will be included in package.json files field
	 *   - `target`: Current build target (dev/npm/jsr)
	 *
	 * @example
	 * ```typescript
	 * import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';
	 *
	 * export default NodeLibraryBuilder.create({
	 *   transformFiles({ compilation, filesArray }) {
	 *     // Copy index.cjs to .pnpmfile.cjs
	 *     const indexAsset = compilation.assets['index.cjs'];
	 *     if (indexAsset) {
	 *       compilation.assets['.pnpmfile.cjs'] = indexAsset;
	 *       filesArray.add('.pnpmfile.cjs');
	 *     }
	 *   },
	 * });
	 * ```
	 */
	transformFiles?: (context: {
		/** Rspack compilation object with assets */
		compilation: {
			assets: Record<string, unknown>;
		};
		filesArray: Set<string>;
		target: BuildTarget;
	}) => void | Promise<void>;
	/**
	 * Optional transform function to modify package.json before it's saved.
	 * Called after all standard transformations are applied.
	 *
	 * @param context - Transform context containing the target and package.json
	 * @returns The modified package.json (mutations are also supported)
	 *
	 * @example
	 * ```typescript
	 * import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';
	 *
	 * export default NodeLibraryBuilder.create({
	 *   transform({ target, pkg }) {
	 *     if (target === 'npm') {
	 *       delete pkg.devDependencies;
	 *       delete pkg.scripts;
	 *     }
	 *     return pkg;
	 *   },
	 * });
	 * ```
	 */
	transform?: TransformPackageJsonFn;
	/**
	 * Options for API model generation.
	 * When enabled, generates an `<unscopedPackageName>.api.json` file in the dist directory.
	 * Only applies when target is "npm".
	 *
	 * @remarks
	 * The generated API model file contains the full API documentation
	 * in a machine-readable format for use by documentation generators.
	 * The file is emitted to dist but excluded from npm publish (added as negated pattern in `files` array).
	 *
	 * @example
	 * Enable API model generation with defaults:
	 * ```typescript
	 * import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';
	 *
	 * export default NodeLibraryBuilder.create({
	 *   apiModel: true,
	 * });
	 * ```
	 *
	 * @example
	 * Enable with custom filename:
	 * ```typescript
	 * import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';
	 *
	 * export default NodeLibraryBuilder.create({
	 *   apiModel: {
	 *     enabled: true,
	 *     filename: 'my-package.api.json',
	 *   },
	 * });
	 * ```
	 */
	apiModel?: ApiModelOptions | boolean;
	/**
	 * Options for TSDoc lint validation.
	 * When enabled, validates TSDoc comments before the build starts.
	 *
	 * @remarks
	 * Uses ESLint with `eslint-plugin-tsdoc` to validate TSDoc syntax.
	 * By default, throws errors in CI environments and logs errors locally.
	 * The generated `tsdoc.json` config is persisted locally for IDE integration.
	 *
	 * @example
	 * Enable with defaults (throws in CI, errors locally):
	 * ```typescript
	 * import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';
	 *
	 * export default NodeLibraryBuilder.create({
	 *   tsdocLint: true,
	 * });
	 * ```
	 *
	 * @example
	 * Enable with custom configuration:
	 * ```typescript
	 * import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';
	 *
	 * export default NodeLibraryBuilder.create({
	 *   tsdocLint: {
	 *     tsdoc: {
	 *       tagDefinitions: [{ tagName: '@error', syntaxKind: 'block' }],
	 *     },
	 *     onError: 'throw',
	 *     persistConfig: true,
	 *   },
	 * });
	 * ```
	 */
	tsdocLint?: TsDocLintPluginOptions | boolean;
}

/**
 * Builder for Node.js ESM libraries using RSlib.
 *
 * @remarks
 * NodeLibraryBuilder provides a high-level API for building modern ESM Node.js libraries.
 * It handles TypeScript compilation, declaration bundling, package.json transformation,
 * and multi-target builds (dev and npm).
 *
 * Features:
 * - Automatic entry point detection from package.json exports
 * - TypeScript declarations via tsgo + API Extractor
 * - pnpm catalog and workspace protocol resolution
 * - Source maps for development builds
 * - Configurable external dependencies and type bundling
 *
 * @example
 * Basic usage in `rslib.config.ts`:
 * ```typescript
 * import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';
 *
 * export default NodeLibraryBuilder.create();
 * ```
 *
 * @example
 * With custom options:
 * ```typescript
 * import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';
 *
 * export default NodeLibraryBuilder.create({
 *   externals: ['@rslib/core', '@rsbuild/core'],
 *   dtsBundledPackages: ['picocolors'],
 *   apiModel: true,
 *   transform({ target, pkg }) {
 *     if (target === 'npm') {
 *       delete pkg.devDependencies;
 *     }
 *     return pkg;
 *   },
 * });
 * ```
 *
 * @example
 * Build commands:
 * ```bash
 * # Development build (with source maps)
 * rslib build --env-mode dev
 *
 * # Production build (for npm publishing)
 * rslib build --env-mode npm
 * ```
 *
 * @public
 */
/* v8 ignore next -- @preserve */
// biome-ignore lint/complexity/noStaticOnlyClass: <This is a nicety for the API>
export class NodeLibraryBuilder {
	static DEFAULT_OPTIONS: NodeLibraryBuilderOptions = {
		entry: undefined,
		plugins: [],
		define: {},
		copyPatterns: [],
		targets: ["dev", "npm"],
		tsconfigPath: undefined,
		externals: [],
		dtsBundledPackages: undefined,
		transformFiles: undefined,
		tsdocLint: undefined,
	};
	static mergeOptions(options: Partial<NodeLibraryBuilderOptions> = {}): NodeLibraryBuilderOptions {
		const merged = {
			...NodeLibraryBuilder.DEFAULT_OPTIONS,
			...options,
			// Deep copy arrays to avoid mutating DEFAULT_OPTIONS
			copyPatterns: [...(options.copyPatterns ?? NodeLibraryBuilder.DEFAULT_OPTIONS.copyPatterns)],
		};
		if (existsSync(join(process.cwd(), "public"))) {
			merged.copyPatterns.unshift({ from: "./public", to: "./", context: process.cwd() });
		}
		return merged;
	}
	/**
	 * Creates an async RSLib configuration function that determines build target from envMode.
	 * This provides a clean API where users don't need to handle environment logic.
	 */
	static create(options: Partial<NodeLibraryBuilderOptions> = {}): RslibConfigAsyncFn {
		const mergedOptions = NodeLibraryBuilder.mergeOptions(options);

		return async ({ envMode }: { envMode?: string }): Promise<RslibConfig> => {
			// Use envMode to determine build target, default to "dev"
			const target = (envMode as BuildTarget) || "dev";

			// Validate target
			const validTargets: BuildTarget[] = ["dev", "npm"];
			if (!validTargets.includes(target)) {
				throw new Error(
					`Invalid env-mode: "${target}". Must be one of: ${validTargets.join(", ")}\n` +
						`Example: rslib build --env-mode npm`,
				);
			}

			// Create target-specific configuration
			const targetConfig = await NodeLibraryBuilder.createSingleTarget(target, mergedOptions);

			return targetConfig;
		};
	}
	/**
	 * Creates a single-target build configuration.
	 * This allows proper plugin isolation per build target.
	 */
	static async createSingleTarget(target: BuildTarget, opts: NodeLibraryBuilderOptions): Promise<RslibConfig> {
		const options = NodeLibraryBuilder.mergeOptions(opts);

		const VERSION = await packageJsonVersion();

		// Create target-specific plugins
		const plugins: RsbuildPlugin[] = [];

		// Add TSDoc lint plugin if enabled (runs before build via onBeforeBuild)
		if (options.tsdocLint) {
			const lintOptions: TsDocLintPluginOptions = options.tsdocLint === true ? {} : options.tsdocLint;
			// Share tsdoc config with apiModel if configured
			if (!lintOptions.tsdoc && typeof options.apiModel === "object" && options.apiModel.tsdoc) {
				lintOptions.tsdoc = options.apiModel.tsdoc;
			}
			plugins.push(TsDocLintPlugin(lintOptions));
		}

		// Standard plugins for dev and npm targets
		if (target === "dev" || target === "npm") {
			// Add auto-entry plugin if no explicit entries provided
			if (!options.entry) {
				plugins.push(
					AutoEntryPlugin({
						exportsAsIndexes: options.exportsAsIndexes,
					}),
				);
			}

			// Process package.json with pnpm + RSLib transformations
			// Wrap user's transform to provide target context
			const userTransform = options.transform;
			const transformFn = userTransform ? (pkg: PackageJson): PackageJson => userTransform({ target, pkg }) : undefined;

			plugins.push(
				PackageJsonTransformPlugin({
					forcePrivate: target === "dev",
					bundle: true,
					target,
					transform: transformFn,
				}),
			);

			// Add files array plugin to manage package.json files array
			plugins.push(
				FilesArrayPlugin({
					target,
					transformFiles: options.transformFiles,
				}),
			);
		}

		// Add user-provided plugins
		if (options.plugins) {
			plugins.push(...options.plugins);
		}

		// Build output configuration
		const outputDir = `dist/${target}`;

		const entry = options.entry;

		// Add our custom DTS plugin that uses tsgo and emits through asset pipeline
		// The plugin will generate the temp tsconfig itself since it needs access to api.context.rootPath
		// Only enable API model generation for npm target (not dev)
		const apiModelForTarget = target === "npm" ? options.apiModel : undefined;

		plugins.push(
			DtsPlugin({
				tsconfigPath: options.tsconfigPath, // Pass through user's tsconfig if provided
				abortOnError: true,
				bundle: true,
				bundledPackages: options.dtsBundledPackages,
				buildTarget: target,
				apiModel: apiModelForTarget,
			}),
		);

		const lib: LibConfig = {
			id: target,
			outBase: outputDir,
			output: {
				target: "node",
				module: true,
				cleanDistPath: true,
				sourceMap: target === "dev", // Only enable source maps for dev target
				distPath: {
					root: outputDir,
				},
				copy: {
					patterns: options.copyPatterns,
				},
				externals: options.externals && options.externals.length > 0 ? options.externals : undefined,
			},
			format: "esm",
			experiments: {
				advancedEsm: true,
			},
			bundle: true,
			plugins,
			source: {
				// Don't set tsconfigPath here - DtsPlugin will generate and use its own temp config
				// RSLib will use its default tsconfig resolution for JS compilation
				tsconfigPath: options.tsconfigPath, // Only pass through if user explicitly provided one
				entry,
				define: {
					"process.env.__PACKAGE_VERSION__": JSON.stringify(VERSION),
					...options.define,
				},
			},
		};

		// TypeScript declarations are now handled by our custom DtsPlugin (added to plugins above)
		// which uses tsgo and emits through the asset pipeline instead of RSLib's default DTS plugin

		return defineConfig({
			lib: [lib],
			// RSLib will use its default tsconfig resolution for JS compilation
			// Declaration generation is handled by DtsPlugin
			source: {
				tsconfigPath: options.tsconfigPath, // Only pass through if user explicitly provided one
			},
			performance: {
				buildCache: {
					cacheDirectory: `.rslib/cache/${target}`,
				},
			},
		});
	}
}
