/**
 * Main BunLibraryBuilder class for building Node.js libraries with Bun.
 *
 * @remarks
 * This module provides the primary entry point for building TypeScript libraries
 * using Bun's native bundler. The `BunLibraryBuilder` class orchestrates the entire
 * build pipeline from entry point detection to package.json transformation.
 *
 * @packageDocumentation
 */

import { parseArgs } from "node:util";
import { executeBuild } from "../hooks/build-lifecycle.js";
// biome-ignore lint/correctness/useImportExtensions: Bun macros require .ts extension
import { getVersion } from "../macros/version.ts" with { type: "macro" };
import { BuildLogger } from "../plugins/utils/logger.js";
import type { BuildResult, BuildTarget, BunLibraryBuilderOptions } from "../types/builder-types.js";

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
 * ## Build Targets
 *
 * | Target | Source Maps | Minify | API Model | Output Directory |
 * |--------|-------------|--------|-----------|------------------|
 * | `dev`  | linked      | false  | false     | `dist/dev/`      |
 * | `npm`  | none        | false  | true      | `dist/npm/`      |
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
 * @example
 * Running builds from the command line:
 * ```bash
 * # Build for development
 * bun run bun.config.ts --env-mode dev
 *
 * # Build for npm publishing
 * bun run bun.config.ts --env-mode npm
 *
 * # Build all targets (default)
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
	 * Default build targets when none are specified.
	 *
	 * @internal
	 */
	private static readonly DEFAULT_TARGETS: BuildTarget[] = ["dev", "npm"];

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
		this.options = options;
	}

	/**
	 * Creates a BunLibraryBuilder and executes the build.
	 *
	 * @remarks
	 * This is the recommended entry point for building libraries. It combines
	 * instantiation and execution in a single call, making it ideal for use
	 * in build configuration files.
	 *
	 * The method parses command-line arguments to determine which targets to build:
	 * - `--env-mode dev`: Build only the development target
	 * - `--env-mode npm`: Build only the npm target
	 * - No flag: Build all targets specified in options (defaults to both)
	 *
	 * @param options - Builder configuration options
	 * @returns A promise resolving to an array of build results, one per target
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
	 * Executes the build for specified targets.
	 *
	 * @remarks
	 * Runs the complete build pipeline for each target sequentially.
	 * If no targets are specified, determines targets from:
	 * 1. Command-line `--env-mode` argument
	 * 2. `targets` option in builder configuration
	 * 3. Defaults to `["dev", "npm"]`
	 *
	 * @param targets - Build targets to execute. If not specified, uses CLI args or defaults.
	 * @returns Promise resolving to an array of build results, one per target
	 *
	 * @example
	 * Build specific targets programmatically:
	 * ```typescript
	 * import type { BuildResult } from '@savvy-web/bun-builder';
	 * import { BunLibraryBuilder } from '@savvy-web/bun-builder';
	 *
	 * const builder = new BunLibraryBuilder({});
	 * const results: BuildResult[] = await builder.run(['npm']);
	 * ```
	 */
	async run(targets?: BuildTarget[]): Promise<BuildResult[]> {
		const logger = BuildLogger.createLogger("bun-builder");
		const timer = BuildLogger.createTimer();

		// Print banner with version (embedded at compile time)
		BuildLogger.printBanner(BunLibraryBuilder.VERSION);

		// Determine targets from args or options
		const resolvedTargets = targets ?? this.resolveTargets();

		logger.info(`Building targets: ${resolvedTargets.join(", ")}`);

		const results: BuildResult[] = [];

		for (const target of resolvedTargets) {
			try {
				const result = await executeBuild(this.options, target);
				results.push(result);

				if (!result.success) {
					logger.error(`Build failed for target: ${target}`);
				}
			} catch (error) {
				const errorObj = error instanceof Error ? error : new Error(String(error));
				logger.error(`Build error for target ${target}: ${errorObj.message}`);
				results.push({
					success: false,
					target,
					outdir: `dist/${target}`,
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
			logger.ready(`Built ${results.length} target(s) in ${BuildLogger.formatTime(timer.elapsed())}`);
		}

		return results;
	}

	/**
	 * Builds a single target.
	 *
	 * @remarks
	 * Lower-level method for building a specific target without the
	 * banner, logging, or summary output. Useful when integrating
	 * the builder into custom build pipelines.
	 *
	 * @param target - The build target to execute
	 * @returns Promise resolving to the build result for the specified target
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
	async build(target: BuildTarget): Promise<BuildResult> {
		return executeBuild(this.options, target);
	}

	/**
	 * Resolves build targets from command-line arguments or options.
	 *
	 * @remarks
	 * Resolution priority:
	 * 1. `--env-mode` CLI argument (if valid)
	 * 2. `targets` option from builder configuration
	 * 3. Default: `["dev", "npm"]`
	 *
	 * @returns Array of build targets to execute
	 *
	 * @internal
	 */
	private resolveTargets(): BuildTarget[] {
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

		// Use options or default to both targets
		return this.options.targets ?? BunLibraryBuilder.DEFAULT_TARGETS;
	}
}

/**
 * Re-export types for convenience.
 */
export type {
	ApiModelOptions,
	BuildResult,
	BuildTarget,
	BunLibraryBuilderOptions,
	CopyPatternConfig,
	EntryPoints,
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
