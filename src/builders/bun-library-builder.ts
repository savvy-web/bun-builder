/**
 * Main BunLibraryBuilder class for building Node.js libraries with Bun.
 *
 * @remarks
 * This module provides the primary entry point for building TypeScript libraries
 * using Bun's native bundler. The `BunLibraryBuilder` class orchestrates the entire
 * build pipeline from entry point detection to package.json transformation.
 *
 */

import { parseArgs } from "node:util";
import { executeBuild } from "../hooks/build-lifecycle.js";
// biome-ignore lint/correctness/useImportExtensions: Bun macros require .ts extension
import { getVersion } from "../macros/version.ts" with { type: "macro" };
import { BuildLogger } from "../plugins/utils/logger.js";
import type { BuildMode, BuildResult, BunLibraryBuilderOptions } from "../types/builder-types.js";

/**
 * Bun-based library builder for modern ESM Node.js libraries.
 *
 * @remarks
 * BunLibraryBuilder provides a high-level API for building TypeScript libraries
 * using Bun's native bundler. It orchestrates a complete build pipeline:
 *
 * 1. **Entry Point Detection**: Automatically extracts entries from package.json `exports` and `bin`
 * 2. **TSDoc Validation**: Optional pre-build documentation linting
 * 3. **Bundling**: Uses Bun.build() for fast ESM bundling
 * 4. **Declaration Generation**: Runs tsgo for TypeScript declarations
 * 5. **Declaration Bundling**: Uses API Extractor to bundle .d.ts files
 * 6. **Package.json Transformation**: Updates paths and resolves catalog references
 * 7. **File Copying**: Copies README, LICENSE, and additional assets
 *
 * ## Build Modes
 *
 * | Mode  | Source Maps | Minify | API Model | Output Directory |
 * |-------|-------------|--------|-----------|------------------|
 * | `dev` | linked      | false  | false     | `dist/dev/`      |
 * | `npm` | none        | false  | true      | `dist/npm/`      |
 *
 * ## Usage Patterns
 *
 * The builder supports both static configuration and programmatic usage.
 * Most users should use the static `create()` method in a build configuration file.
 *
 * @example
 * Basic usage in bun.config.ts:
 * ```typescript
 * import { BunLibraryBuilder } from '@savvy-web/bun-builder';
 *
 * export default BunLibraryBuilder.create({});
 * ```
 *
 * @example
 * With custom options:
 * ```typescript
 * import type { BunLibraryBuilderOptions } from '@savvy-web/bun-builder';
 * import { BunLibraryBuilder } from '@savvy-web/bun-builder';
 *
 * const options: BunLibraryBuilderOptions = {
 *   externals: ['lodash'],
 *   dtsBundledPackages: ['type-fest'],
 *   apiModel: true,
 *   tsdocLint: true,
 *   transform({ mode, pkg }) {
 *     if (mode === 'npm') {
 *       delete pkg.devDependencies;
 *     }
 *     return pkg;
 *   },
 * };
 *
 * export default BunLibraryBuilder.create(options);
 * ```
 *
 * @example
 * Running builds from the command line:
 * ```bash
 * # Build for development
 * bun run bun.config.ts --env-mode dev
 *
 * # Build for npm publishing
 * bun run bun.config.ts --env-mode npm
 *
 * # Build all modes (default)
 * bun run bun.config.ts
 * ```
 *
 * @example
 * Programmatic usage:
 * ```typescript
 * import type { BuildResult } from '@savvy-web/bun-builder';
 * import { BunLibraryBuilder } from '@savvy-web/bun-builder';
 *
 * async function buildLibrary(): Promise<void> {
 *   const builder = new BunLibraryBuilder({ externals: ['lodash'] });
 *   const results: BuildResult[] = await builder.run(['npm']);
 *
 *   const failed = results.filter(r => !r.success);
 *   if (failed.length > 0) {
 *     process.exit(1);
 *   }
 * }
 *
 * buildLibrary();
 * ```
 *
 * @public
 */
export class BunLibraryBuilder {
	/**
	 * Package version embedded at compile time via Bun macro.
	 *
	 * @internal
	 */
	private static readonly VERSION: string = getVersion();

	/**
	 * Default build modes when none are specified.
	 *
	 * @internal
	 */
	private static readonly DEFAULT_MODES: BuildMode[] = ["dev", "npm"];

	/**
	 * Default options applied to all builds.
	 *
	 * @remarks
	 * These defaults match the rslib-builder conventions:
	 * - `apiModel: true`: API model generation is enabled by default
	 * - `bundle: true`: Bundled output mode by default
	 */
	static readonly DEFAULT_OPTIONS: Partial<BunLibraryBuilderOptions> = {
		apiModel: true,
		bundle: true,
	};

	/**
	 * Builder configuration options.
	 *
	 * @internal
	 */
	private readonly options: BunLibraryBuilderOptions;

	/**
	 * Creates a new BunLibraryBuilder instance.
	 *
	 * @remarks
	 * For most use cases, prefer the static `create()` method which both
	 * instantiates the builder and executes the build in one call.
	 *
	 * @param options - Builder configuration options
	 *
	 * @example
	 * ```typescript
	 * import { BunLibraryBuilder } from '@savvy-web/bun-builder';
	 *
	 * const builder = new BunLibraryBuilder({
	 *   externals: ['lodash'],
	 * });
	 * ```
	 */
	constructor(options: BunLibraryBuilderOptions = {}) {
		this.options = { ...BunLibraryBuilder.DEFAULT_OPTIONS, ...options };
	}

	/**
	 * Creates a BunLibraryBuilder and executes the build.
	 *
	 * @remarks
	 * This is the recommended entry point for building libraries. It combines
	 * instantiation and execution in a single call, making it ideal for use
	 * in build configuration files.
	 *
	 * The method parses command-line arguments to determine which modes to build:
	 * - `--env-mode dev`: Build only the development mode
	 * - `--env-mode npm`: Build only the npm mode
	 * - No flag: Build all modes specified in options (defaults to both)
	 *
	 * @param options - Builder configuration options
	 * @returns A promise resolving to an array of build results, one per mode
	 *
	 * @example
	 * Basic usage in bun.config.ts:
	 * ```typescript
	 * import { BunLibraryBuilder } from '@savvy-web/bun-builder';
	 *
	 * export default BunLibraryBuilder.create({
	 *   externals: ['react'],
	 * });
	 * ```
	 *
	 * @example
	 * Handling build results:
	 * ```typescript
	 * import type { BuildResult } from '@savvy-web/bun-builder';
	 * import { BunLibraryBuilder } from '@savvy-web/bun-builder';
	 *
	 * const results: BuildResult[] = await BunLibraryBuilder.create({});
	 * const success = results.every(r => r.success);
	 * process.exit(success ? 0 : 1);
	 * ```
	 */
	static async create(options: BunLibraryBuilderOptions = {}): Promise<BuildResult[]> {
		const builder = new BunLibraryBuilder(options);
		return builder.run();
	}

	/**
	 * Executes the build for specified modes.
	 *
	 * @remarks
	 * Runs the complete build pipeline for each mode sequentially.
	 * If no modes are specified, determines modes from:
	 * 1. Command-line `--env-mode` argument
	 * 2. `targets` option in builder configuration
	 * 3. Defaults to `["dev", "npm"]`
	 *
	 * @param modes - Build modes to execute. If not specified, uses CLI args or defaults.
	 * @returns Promise resolving to an array of build results, one per mode
	 *
	 * @example
	 * Build specific modes programmatically:
	 * ```typescript
	 * import type { BuildResult } from '@savvy-web/bun-builder';
	 * import { BunLibraryBuilder } from '@savvy-web/bun-builder';
	 *
	 * const builder = new BunLibraryBuilder({});
	 * const results: BuildResult[] = await builder.run(['npm']);
	 * ```
	 */
	async run(modes?: BuildMode[]): Promise<BuildResult[]> {
		const logger = BuildLogger.createLogger("bun-builder");
		const timer = BuildLogger.createTimer();

		// Print banner with version (embedded at compile time)
		BuildLogger.printBanner(BunLibraryBuilder.VERSION);

		// Determine modes from args or options
		const resolvedModes = modes ?? this.resolveModes();

		logger.info(`Building modes: ${resolvedModes.join(", ")}`);

		const results: BuildResult[] = [];

		for (const mode of resolvedModes) {
			try {
				const result = await executeBuild(this.options, mode);
				results.push(result);

				if (!result.success) {
					logger.error(`Build failed for mode: ${mode}`);
				}
			} catch (error) {
				const errorObj = error instanceof Error ? error : new Error(String(error));
				logger.error(`Build error for mode ${mode}: ${errorObj.message}`);
				results.push({
					success: false,
					mode,
					outdir: `dist/${mode}`,
					outputs: [],
					duration: 0,
					errors: [errorObj],
				});
			}
		}

		const failedCount = results.filter((r) => !r.success).length;

		console.log(); // Blank line before summary

		if (failedCount > 0) {
			logger.error(`Build completed with ${failedCount} failure(s)`);
		} else {
			logger.ready(`Built ${results.length} mode(s) in ${BuildLogger.formatTime(timer.elapsed())}`);
		}

		return results;
	}

	/**
	 * Builds a single mode.
	 *
	 * @remarks
	 * Lower-level method for building a specific mode without the
	 * banner, logging, or summary output. Useful when integrating
	 * the builder into custom build pipelines.
	 *
	 * @param mode - The build mode to execute
	 * @returns Promise resolving to the build result for the specified mode
	 *
	 * @example
	 * ```typescript
	 * import type { BuildResult } from '@savvy-web/bun-builder';
	 * import { BunLibraryBuilder } from '@savvy-web/bun-builder';
	 *
	 * const builder = new BunLibraryBuilder({});
	 * const result: BuildResult = await builder.build('npm');
	 *
	 * if (!result.success) {
	 *   console.error('Build failed:', result.errors);
	 * }
	 * ```
	 */
	async build(mode: BuildMode): Promise<BuildResult> {
		return executeBuild(this.options, mode);
	}

	/**
	 * Resolves build modes from command-line arguments or options.
	 *
	 * @remarks
	 * Resolution priority:
	 * 1. `--env-mode` CLI argument (if valid)
	 * 2. `targets` option from builder configuration
	 * 3. Default: `["dev", "npm"]`
	 *
	 * @returns Array of build modes to execute
	 *
	 * @internal
	 */
	private resolveModes(): BuildMode[] {
		// Check for --env-mode argument
		try {
			const { values } = parseArgs({
				args: process.argv.slice(2),
				options: {
					"env-mode": {
						type: "string",
					},
				},
				allowPositionals: true,
				strict: false,
			});

			const envMode = values["env-mode"];
			if (envMode === "dev" || envMode === "npm") {
				return [envMode];
			}
		} catch {
			// Ignore parse errors
		}

		// Use options or default to both modes
		return this.options.targets ?? BunLibraryBuilder.DEFAULT_MODES;
	}
}

/**
 * Re-export types for convenience.
 */
export type {
	ApiModelOptions,
	BuildMode,
	BuildResult,
	BunLibraryBuilderOptions,
	CopyPatternConfig,
	EntryPoints,
	PublishTarget,
	TransformFilesCallback,
	TransformFilesContext,
	TransformPackageJsonFn,
	TsDocLintErrorBehavior,
	TsDocLintOptions,
	TsDocMetadataOptions,
	TsDocOptions,
	TsDocTagDefinition,
	TsDocTagGroup,
	VirtualEntryConfig,
} from "../types/builder-types.js";
