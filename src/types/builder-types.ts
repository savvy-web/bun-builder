/**
 * Type definitions for the Bun Library Builder.
 *
 * @remarks
 * This module provides comprehensive type definitions for configuring and using
 * the BunLibraryBuilder. All types are designed to work together to provide a
 * type-safe build configuration experience.
 *
 * @packageDocumentation
 */

import type { BunPlugin } from "bun";
import type { PackageJson } from "./package-json.js";

/**
 * Configuration for a virtual entry point.
 *
 * @remarks
 * Virtual entries are bundled files that are NOT part of the package's
 * public exports. They skip declaration generation and are not added to
 * the exports field of package.json, but ARE included in the files array
 * for publishing.
 *
 * Common use cases include pnpmfile.cjs, CLI shims, or other configuration
 * files that need bundling but not type generation.
 *
 * @example
 * ```typescript
 * import type { VirtualEntryConfig } from '@savvy-web/bun-builder';
 *
 * const config: VirtualEntryConfig = {
 *   source: './src/pnpmfile.ts',
 *   format: 'cjs',
 * };
 * ```
 *
 * @public
 */
export interface VirtualEntryConfig {
	/**
	 * Path to the source file to bundle.
	 *
	 * @remarks
	 * Resolved relative to the project root (cwd).
	 */
	source: string;

	/**
	 * Output format for the virtual entry.
	 *
	 * @remarks
	 * Defaults to the builder's format option (or "esm" if not set).
	 *
	 * @defaultValue Inherits from builder format option
	 */
	format?: "esm" | "cjs";
}

/**
 * Build target environment for library output.
 *
 * @remarks
 * Each target produces different output optimizations:
 *
 * | Target | Source Maps | Minify | API Model | Output Directory |
 * |--------|-------------|--------|-----------|------------------|
 * | `dev`  | linked      | false  | false     | `dist/dev/`      |
 * | `npm`  | none        | false  | true      | `dist/npm/`      |
 *
 * - **`dev`**: Development build with linked source maps for debugging.
 *   Output is marked as private to prevent accidental publishing.
 * - **`npm`**: Production build optimized for npm publishing. Includes
 *   API model generation and catalog reference resolution.
 *
 * @example
 * Specifying a single target via CLI:
 * ```bash
 * bun run bun.config.ts --env-mode dev
 * bun run bun.config.ts --env-mode npm
 * ```
 *
 * @example
 * Specifying targets in builder options:
 * ```typescript
 * import { BunLibraryBuilder } from '@savvy-web/bun-builder';
 *
 * export default BunLibraryBuilder.create({
 *   targets: ['npm'], // Only build npm target
 * });
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
 * allowing you to modify the package.json before it is written to the output directory.
 * Both returning a new object and mutating the `pkg` object directly are supported.
 *
 * Standard transformations applied before this function is called:
 * - Export paths are transformed from TypeScript to JavaScript extensions
 * - Source directory prefixes (`./src/`, `./exports/`) are stripped
 * - `catalog:` and `workspace:` references are resolved (npm target only)
 * - `publishConfig` and `scripts` fields are removed
 *
 * @param context - Transform context containing the build target and package.json
 * @returns The modified package.json object
 *
 * @example
 * Remove development-only fields for npm publishing:
 * ```typescript
 * import type { TransformPackageJsonFn } from '@savvy-web/bun-builder';
 * import type { PackageJson } from '@savvy-web/bun-builder';
 *
 * const transform: TransformPackageJsonFn = ({ target, pkg }): PackageJson => {
 *   if (target === 'npm') {
 *     delete pkg.devDependencies;
 *     delete pkg.scripts;
 *   }
 *   return pkg;
 * };
 * ```
 *
 * @example
 * Add custom metadata for a specific target:
 * ```typescript
 * import type { TransformPackageJsonFn } from '@savvy-web/bun-builder';
 * import type { PackageJson } from '@savvy-web/bun-builder';
 *
 * const transform: TransformPackageJsonFn = ({ target, pkg }): PackageJson => {
 *   if (target === 'dev') {
 *     pkg.private = true;
 *   }
 *   return pkg;
 * };
 * ```
 *
 * @public
 */
export type TransformPackageJsonFn = (context: { target: BuildTarget; pkg: PackageJson }) => PackageJson;

/**
 * Configuration for copying files during the build process.
 *
 * @remarks
 * This interface defines patterns for copying additional files to the build output.
 * Files are copied after the main bundling phase but before the files array is finalized.
 *
 * The builder automatically copies certain files if they exist:
 * - `./src/public/` or `./public/` directories
 * - `README.md`
 * - `LICENSE`
 *
 * Use this configuration to copy additional files beyond the automatic defaults.
 *
 * @example
 * Copy a directory to the output root:
 * ```typescript
 * import type { CopyPatternConfig } from '@savvy-web/bun-builder';
 *
 * const pattern: CopyPatternConfig = {
 *   from: './assets',
 *   to: './',
 * };
 * ```
 *
 * @example
 * Copy optional configuration files:
 * ```typescript
 * import type { CopyPatternConfig } from '@savvy-web/bun-builder';
 *
 * const pattern: CopyPatternConfig = {
 *   from: '.npmrc',
 *   noErrorOnMissing: true,
 * };
 * ```
 *
 * @public
 */
export interface CopyPatternConfig {
	/**
	 * Source path or glob pattern to copy from.
	 *
	 * @remarks
	 * Paths are resolved relative to the current working directory.
	 * Can be a file path or a directory path.
	 */
	from: string;

	/**
	 * Destination path relative to the output directory.
	 *
	 * @remarks
	 * If not specified, files are copied to the output directory root
	 * with their original filename.
	 *
	 * @defaultValue `"./"` (output directory root)
	 */
	to?: string;

	/**
	 * Suppress errors when the source file or directory does not exist.
	 *
	 * @remarks
	 * When `true`, missing source files are silently skipped.
	 * When `false` or not specified, a warning is logged for missing sources.
	 *
	 * @defaultValue `false`
	 */
	noErrorOnMissing?: boolean;
}

/**
 * Context passed to the transformFiles callback.
 *
 * @remarks
 * This context provides access to build outputs for post-processing.
 * You can modify file contents, add or remove files from the files array,
 * or perform any other transformations needed before finalization.
 *
 * @example
 * ```typescript
 * import type { TransformFilesContext } from '@savvy-web/bun-builder';
 *
 * function processContext(context: TransformFilesContext): void {
 *   // Add a generated file to the outputs
 *   context.outputs.set('version.txt', context.target);
 *
 *   // Include it in the package files
 *   context.filesArray.add('version.txt');
 * }
 * ```
 *
 * @public
 */
export interface TransformFilesContext {
	/**
	 * Map of output filenames to their content.
	 *
	 * @remarks
	 * Keys are paths relative to the output directory.
	 * Values are the file content as either a UTF-8 string or binary data.
	 * You can modify existing entries or add new files to this map.
	 */
	outputs: Map<string, Uint8Array | string>;

	/**
	 * Set of files that will be included in the package.json `files` field.
	 *
	 * @remarks
	 * Add or remove entries to control which files are published.
	 * Entries starting with `!` are excluded (negation pattern).
	 */
	filesArray: Set<string>;

	/**
	 * The current build target being processed.
	 *
	 * @remarks
	 * Use this to apply target-specific transformations.
	 */
	target: BuildTarget;
}

/**
 * Callback function for post-build file manipulation.
 *
 * @remarks
 * This callback is invoked after bundling and declaration generation but before
 * the final package.json is written. Use it for advanced post-processing needs.
 *
 * @example
 * Add a build metadata file:
 * ```typescript
 * import type { TransformFilesCallback } from '@savvy-web/bun-builder';
 *
 * const transformFiles: TransformFilesCallback = async (context) => {
 *   const metadata = JSON.stringify({
 *     buildDate: new Date().toISOString(),
 *     target: context.target,
 *   });
 *   context.outputs.set('build-metadata.json', metadata);
 *   context.filesArray.add('build-metadata.json');
 * };
 * ```
 *
 * @public
 */
export type TransformFilesCallback = (context: TransformFilesContext) => void | Promise<void>;

/**
 * TSDoc tag definition for custom documentation tags.
 *
 * @remarks
 * Use this to define custom TSDoc tags beyond the standard set.
 * Custom tags can be block tags (like `@remarks`), inline tags
 * (like `{@link}`), or modifier tags (like `@public`).
 *
 * @example
 * Define a custom `@category` block tag:
 * ```typescript
 * import type { TsDocTagDefinition } from '@savvy-web/bun-builder';
 *
 * const categoryTag: TsDocTagDefinition = {
 *   tagName: '@category',
 *   syntaxKind: 'block',
 *   allowMultiple: false,
 * };
 * ```
 *
 * @public
 */
export interface TsDocTagDefinition {
	/**
	 * The tag name including the at-sign prefix.
	 *
	 * @example `"@error"`, `"@category"`, `"@slot"`
	 */
	tagName: string;

	/**
	 * How the tag content is parsed.
	 *
	 * @remarks
	 * - `"block"`: Tag followed by content until the next tag (like `@remarks`)
	 * - `"inline"`: Tag with content in braces (like `{@link}`)
	 * - `"modifier"`: Tag with no content (like `@public`)
	 */
	syntaxKind: "block" | "inline" | "modifier";

	/**
	 * Whether the tag can appear multiple times on a single declaration.
	 *
	 * @defaultValue `false`
	 */
	allowMultiple?: boolean;
}

/**
 * TSDoc standardization groups for predefined tag sets.
 *
 * @remarks
 * These groups correspond to the TSDoc specification levels:
 * - `"core"`: Tags required by all TSDoc implementations
 * - `"extended"`: Optional tags recommended for most projects
 * - `"discretionary"`: Tags that may vary by implementation
 *
 * @see {@link https://tsdoc.org/pages/spec/standardization_groups/ | TSDoc Standardization Groups}
 *
 * @public
 */
export type TsDocTagGroup = "core" | "extended" | "discretionary";

/**
 * TSDoc configuration options.
 *
 * @remarks
 * These options control TSDoc validation and configuration file generation.
 * The configuration is used by both the TSDoc lint phase and API Extractor.
 *
 * @public
 */
export interface TsDocOptions {
	/**
	 * TSDoc tag groups to enable.
	 *
	 * @remarks
	 * Specifies which standardization groups of TSDoc tags to support.
	 * Most projects should use all three groups for full TSDoc compatibility.
	 *
	 * @defaultValue `["core", "extended", "discretionary"]`
	 */
	groups?: TsDocTagGroup[];

	/**
	 * Custom TSDoc tag definitions beyond the standard groups.
	 *
	 * @remarks
	 * Use this to add project-specific documentation tags.
	 */
	tagDefinitions?: TsDocTagDefinition[];

	/**
	 * Override support for specific tags.
	 *
	 * @remarks
	 * This is typically only needed to disable tags that are normally enabled.
	 * Map tag names (with `@` prefix) to `false` to disable them.
	 */
	supportForTags?: Record<string, boolean>;

	/**
	 * Persist tsdoc.json to disk for tool integration.
	 *
	 * @remarks
	 * When `true`, writes a `tsdoc.json` file for IDEs and other tools.
	 * When a string, uses that path for the configuration file.
	 *
	 * @defaultValue `true` when not in CI, `false` in CI environments
	 */
	persistConfig?: boolean | string;

	/**
	 * How to handle TSDoc validation warnings.
	 *
	 * @remarks
	 * - `"fail"`: Fail the build on warnings
	 * - `"log"`: Log warnings but continue
	 * - `"none"`: Suppress warnings entirely
	 *
	 * @defaultValue `"fail"` in CI, `"log"` otherwise
	 */
	warnings?: "log" | "fail" | "none";

	/**
	 * TSDoc lint validation options.
	 *
	 * @remarks
	 * When `true`, uses default lint options. When an object, allows full
	 * customization. When `false`, disables linting.
	 *
	 * Lint shares the parent TSDoc configuration (groups, tagDefinitions, etc.)
	 * so tag definitions are configured once and used for both linting and
	 * API Extractor.
	 *
	 * @defaultValue `true` when apiModel is enabled
	 */
	lint?: TsDocLintOptions | boolean;
}

/**
 * Options for API model generation.
 *
 * @remarks
 * API models are JSON files containing parsed API documentation that can be
 * consumed by documentation generators like API Documenter. The model includes
 * all public API signatures, TSDoc comments, and type information.
 *
 * API model generation is only performed for the `npm` target, as the model
 * is intended for documentation purposes rather than development.
 *
 * @example
 * Enable API model with default settings:
 * ```typescript
 * import type { ApiModelOptions } from '@savvy-web/bun-builder';
 *
 * const options: ApiModelOptions = {
 *   enabled: true,
 * };
 * ```
 *
 * @example
 * Custom API model configuration:
 * ```typescript
 * import type { ApiModelOptions } from '@savvy-web/bun-builder';
 *
 * const options: ApiModelOptions = {
 *   enabled: true,
 *   filename: 'my-package.api.json',
 *   localPaths: ['./docs/api'],
 * };
 * ```
 *
 * @public
 */
export interface ApiModelOptions {
	/**
	 * Whether to enable API model generation.
	 *
	 * @defaultValue `false`
	 */
	enabled?: boolean;

	/**
	 * Filename for the generated API model file.
	 *
	 * @remarks
	 * The file is placed in the output directory but excluded from the
	 * published npm package via a negation pattern in the files array.
	 *
	 * @defaultValue `"<unscoped-package-name>.api.json"`
	 */
	filename?: string;

	/**
	 * Local paths to copy the API model to.
	 *
	 * @remarks
	 * Useful for copying the API model to a documentation site directory
	 * or a centralized API model collection.
	 */
	localPaths?: string[];

	/**
	 * TSDoc configuration for custom tag definitions.
	 *
	 * @remarks
	 * Configures which TSDoc tags are recognized when parsing
	 * documentation comments for the API model.
	 */
	tsdoc?: TsDocOptions;

	/**
	 * Options for tsdoc-metadata.json generation.
	 *
	 * @remarks
	 * The tsdoc-metadata.json file describes custom TSDoc tags
	 * used by the package, enabling downstream tools to understand them.
	 */
	tsdocMetadata?: TsDocMetadataOptions | boolean;

	/**
	 * How to handle "forgotten export" messages from API Extractor.
	 *
	 * @remarks
	 * API Extractor reports ae-forgotten-export when a public API references
	 * a declaration that is not exported. This option controls the behavior:
	 *
	 * - `"include"`: Log as warnings (default locally)
	 * - `"error"`: Throw an error and fail the build (default in CI)
	 * - `"ignore"`: Suppress silently
	 *
	 * @defaultValue `"error"` in CI, `"include"` locally
	 */
	forgottenExports?: "include" | "error" | "ignore";
}

/**
 * Options for tsdoc-metadata.json generation.
 *
 * @remarks
 * The tsdoc-metadata.json file declares custom TSDoc tags used by a package,
 * allowing documentation tools and IDEs to properly interpret them.
 *
 * @public
 */
export interface TsDocMetadataOptions {
	/**
	 * Whether to generate tsdoc-metadata.json.
	 *
	 * @defaultValue `true` when API model is enabled
	 */
	enabled?: boolean;

	/**
	 * Custom filename for the TSDoc metadata file.
	 *
	 * @defaultValue `"tsdoc-metadata.json"`
	 */
	filename?: string;
}

/**
 * Error behavior for TSDoc lint errors.
 *
 * @remarks
 * Controls how the build responds to TSDoc validation errors:
 * - `"warn"`: Log as warning and continue the build
 * - `"error"`: Log as error and continue the build
 * - `"throw"`: Throw an error and abort the build
 *
 * @public
 */
export type TsDocLintErrorBehavior = "warn" | "error" | "throw";

/**
 * Options for TSDoc lint validation.
 *
 * @remarks
 * TSDoc linting validates documentation comments in entry point files before
 * the build proceeds. This helps catch documentation issues early and ensures
 * consistent API documentation quality.
 *
 * Linting is performed using ESLint with the `eslint-plugin-tsdoc` plugin.
 *
 * @example
 * Enable TSDoc linting via apiModel.tsdoc.lint:
 * ```typescript
 * import { BunLibraryBuilder } from '@savvy-web/bun-builder';
 *
 * export default BunLibraryBuilder.create({
 *   apiModel: {
 *     tsdoc: { lint: true },
 *   },
 * });
 * ```
 *
 * @example
 * Custom lint configuration:
 * ```typescript
 * import { BunLibraryBuilder } from '@savvy-web/bun-builder';
 *
 * export default BunLibraryBuilder.create({
 *   apiModel: {
 *     tsdoc: {
 *       lint: {
 *         enabled: true,
 *         onError: 'warn',
 *         include: ['src/index.ts'],
 *       },
 *     },
 *   },
 * });
 * ```
 *
 * @public
 */
export interface TsDocLintOptions {
	/**
	 * Whether to enable TSDoc linting.
	 *
	 * @defaultValue `true` when apiModel is enabled
	 */
	enabled?: boolean;

	/**
	 * Override automatic file discovery with explicit patterns.
	 *
	 * @remarks
	 * By default, files are discovered from the package.json exports.
	 * Use this to lint additional files or restrict linting scope.
	 */
	include?: string[];

	/**
	 * How to handle TSDoc lint errors.
	 *
	 * @remarks
	 * The default behavior is stricter in CI environments to ensure
	 * documentation quality in automated pipelines.
	 *
	 * @defaultValue `"throw"` in CI, `"error"` locally
	 */
	onError?: TsDocLintErrorBehavior;
}

/**
 * Configuration options for BunLibraryBuilder.
 *
 * @remarks
 * These options configure all aspects of the build process, from entry point
 * detection to output transformations. Most options have sensible defaults,
 * so minimal configuration is needed for typical library projects.
 *
 * @example
 * Minimal configuration (uses all defaults):
 * ```typescript
 * import { BunLibraryBuilder } from '@savvy-web/bun-builder';
 *
 * export default BunLibraryBuilder.create({});
 * ```
 *
 * @example
 * Full configuration example:
 * ```typescript
 * import type { BunLibraryBuilderOptions } from '@savvy-web/bun-builder';
 * import { BunLibraryBuilder } from '@savvy-web/bun-builder';
 *
 * const options: BunLibraryBuilderOptions = {
 *   externals: ['lodash', /^@aws-sdk\//],
 *   dtsBundledPackages: ['type-fest'],
 *   apiModel: true,
 *   tsdocLint: true,
 *   transform({ target, pkg }) {
 *     if (target === 'npm') {
 *       delete pkg.devDependencies;
 *     }
 *     return pkg;
 *   },
 * };
 *
 * export default BunLibraryBuilder.create(options);
 * ```
 *
 * @public
 */
export interface BunLibraryBuilderOptions {
	/**
	 * Override entry points (optional - auto-detected from package.json).
	 *
	 * @remarks
	 * By default, entry points are extracted from the `exports` and `bin` fields
	 * of package.json. Use this option to override or supplement the detected entries.
	 *
	 * Keys are output names (without extension), values are source file paths.
	 *
	 * @example
	 * ```typescript
	 * entry: {
	 *   'index': './src/index.ts',
	 *   'cli': './src/bin/cli.ts',
	 * }
	 * ```
	 */
	entry?: Record<string, string>;

	/**
	 * Generate index.js files in nested directories matching export paths.
	 *
	 * @remarks
	 * When enabled, export paths create a directory structure with index files
	 * instead of flat files with hyphenated names.
	 *
	 * @example
	 * When `exportsAsIndexes` is `true`:
	 * ```text
	 * exports["./foo/bar"] -> dist/foo/bar/index.js
	 * ```
	 *
	 * When `exportsAsIndexes` is `false` (default):
	 * ```text
	 * exports["./foo/bar"] -> dist/foo-bar.js
	 * ```
	 *
	 * @defaultValue `false`
	 */
	exportsAsIndexes?: boolean;

	/**
	 * Additional files or directories to copy to the output.
	 *
	 * @remarks
	 * The builder automatically copies `README.md`, `LICENSE`, and
	 * `./src/public/` or `./public/` directories if they exist.
	 * Use this to copy additional files.
	 */
	copyPatterns?: (string | CopyPatternConfig)[];

	/**
	 * Additional Bun plugins to use during bundling.
	 *
	 * @remarks
	 * Plugins are passed directly to `Bun.build()`.
	 *
	 * @see {@link https://bun.sh/docs/bundler/plugins | Bun Plugin Documentation}
	 */
	plugins?: BunPlugin[];

	/**
	 * Build-time constant definitions.
	 *
	 * @remarks
	 * These constants are replaced at build time. The builder automatically
	 * defines `process.env.__PACKAGE_VERSION__` with the package version.
	 *
	 * @example
	 * ```typescript
	 * define: {
	 *   'process.env.BUILD_TIME': JSON.stringify(new Date().toISOString()),
	 * }
	 * ```
	 */
	define?: Record<string, string>;

	/**
	 * Path to the TypeScript configuration file for the build.
	 *
	 * @remarks
	 * Used by both tsgo for declaration generation and API Extractor
	 * for declaration bundling.
	 *
	 * @defaultValue `"./tsconfig.json"`
	 */
	tsconfigPath?: string;

	/**
	 * Build targets to include.
	 *
	 * @remarks
	 * Can be overridden via CLI with `--env-mode dev` or `--env-mode npm`.
	 *
	 * @defaultValue `["dev", "npm"]`
	 */
	targets?: BuildTarget[];

	/**
	 * External dependencies that should not be bundled.
	 *
	 * @remarks
	 * Matching dependencies are kept as external imports in the output.
	 * Strings are matched exactly, RegExp patterns match against package names.
	 *
	 * @example
	 * ```typescript
	 * externals: [
	 *   'lodash',           // Exact match
	 *   /^@aws-sdk\//,      // All @aws-sdk packages
	 * ]
	 * ```
	 */
	externals?: (string | RegExp)[];

	/**
	 * Packages whose type declarations should be bundled into the output .d.ts files.
	 *
	 * @remarks
	 * By default, type imports from dependencies are preserved as external references.
	 * Use this to inline type declarations from specific packages, which is useful
	 * for packages that provide utility types used in your public API.
	 *
	 * @example
	 * ```typescript
	 * dtsBundledPackages: ['type-fest', 'ts-essentials']
	 * ```
	 */
	dtsBundledPackages?: string[];

	/**
	 * Callback to transform files after build but before finalization.
	 *
	 * @remarks
	 * Use this for advanced post-processing needs like adding generated files
	 * or modifying bundle contents.
	 */
	transformFiles?: TransformFilesCallback;

	/**
	 * Transform function to modify package.json before it is saved.
	 *
	 * @remarks
	 * Called after all standard transformations. Allows target-specific
	 * modifications to the output package.json.
	 */
	transform?: TransformPackageJsonFn;

	/**
	 * Options for API model generation.
	 *
	 * @remarks
	 * When `true`, uses default API model options.
	 * When an object, allows full customization.
	 * API models are only generated for the `npm` target.
	 *
	 * TSDoc lint is configured via `apiModel.tsdoc.lint`.
	 */
	apiModel?: ApiModelOptions | boolean;

	/**
	 * Virtual entry points that are bundled but not exported.
	 *
	 * @remarks
	 * Virtual entries are files that need bundling but should not generate
	 * type declarations or appear in package.json exports. They ARE added
	 * to the files array for publishing.
	 *
	 * Keys are output filenames (e.g., "pnpmfile.cjs"), values are config objects.
	 *
	 * @example
	 * ```typescript
	 * virtualEntries: {
	 *   'pnpmfile.cjs': { source: './src/pnpmfile.ts', format: 'cjs' },
	 *   'setup.js': { source: './src/setup.ts' },
	 * }
	 * ```
	 */
	virtualEntries?: Record<string, VirtualEntryConfig>;

	/**
	 * Target runtime for Bun.build() bundling.
	 *
	 * @remarks
	 * Controls which runtime the bundle is optimized for:
	 *
	 * - `"bun"`: Bun runtime (default). Allows using Bun-specific APIs and builtins
	 *   like `import { $ } from "bun"`.
	 * - `"node"`: Node.js runtime. Compatible with Node.js environments but cannot
	 *   use Bun-specific APIs.
	 * - `"browser"`: Browser environment. For browser-compatible bundles.
	 *
	 * @defaultValue `"bun"`
	 *
	 * @example
	 * Building for Node.js compatibility:
	 * ```typescript
	 * import { BunLibraryBuilder } from '@savvy-web/bun-builder';
	 *
	 * export default BunLibraryBuilder.create({
	 *   bunTarget: 'node', // Use when targeting pure Node.js environments
	 * });
	 * ```
	 */
	bunTarget?: "bun" | "node" | "browser";
}

/**
 * Result of a build operation.
 *
 * @remarks
 * This interface represents the outcome of building a single target.
 * It contains all information needed to understand what was built
 * and whether the build succeeded.
 *
 * @example
 * Handle build results:
 * ```typescript
 * import type { BuildResult } from '@savvy-web/bun-builder';
 * import { BunLibraryBuilder } from '@savvy-web/bun-builder';
 *
 * const results: BuildResult[] = await BunLibraryBuilder.create({});
 *
 * for (const result of results) {
 *   if (result.success) {
 *     console.log(`Built ${result.target} in ${result.duration}ms`);
 *     console.log(`Output files: ${result.outputs.join(', ')}`);
 *   } else {
 *     console.error(`Failed to build ${result.target}`);
 *     result.errors?.forEach(err => console.error(err.message));
 *   }
 * }
 * ```
 *
 * @public
 */
export interface BuildResult {
	/**
	 * Whether the build succeeded.
	 *
	 * @remarks
	 * A build is considered successful if all phases completed without errors:
	 * bundling, declaration generation, file copying, and package.json transformation.
	 */
	success: boolean;

	/**
	 * The build target that was built.
	 */
	target: BuildTarget;

	/**
	 * Absolute path to the output directory.
	 *
	 * @example `"/path/to/project/dist/npm"`
	 */
	outdir: string;

	/**
	 * List of absolute paths to output files.
	 *
	 * @remarks
	 * Includes bundled JavaScript files but not source maps or declaration files.
	 */
	outputs: string[];

	/**
	 * Build duration in milliseconds.
	 *
	 * @remarks
	 * Measures the total time for all build phases including
	 * TSDoc lint, bundling, declaration generation, and file copying.
	 */
	duration: number;

	/**
	 * Errors that occurred during the build.
	 *
	 * @remarks
	 * Only present when `success` is `false`. Contains error objects
	 * describing what went wrong during the build process.
	 */
	errors?: Error[];
}

/**
 * Entry point mapping from name to source path.
 *
 * @remarks
 * Maps output bundle names to their TypeScript source file paths.
 * Names are derived from package.json exports and bin fields.
 *
 * @example
 * ```typescript
 * import type { EntryPoints } from '@savvy-web/bun-builder';
 *
 * const entries: EntryPoints = {
 *   'index': './src/index.ts',
 *   'utils': './src/utils.ts',
 *   'bin/cli': './src/bin/cli.ts',
 * };
 * ```
 *
 * @public
 */
export interface EntryPoints {
	[name: string]: string;
}
