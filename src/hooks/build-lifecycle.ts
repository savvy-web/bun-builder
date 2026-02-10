/**
 * Build lifecycle orchestration for the Bun Library Builder.
 *
 * @remarks
 * This module implements the core build pipeline, coordinating all phases
 * of the library build process. Each phase is implemented as a separate
 * function that can be called independently or as part of the full pipeline.
 *
 * ## Build Phases
 *
 * 1. **TSDoc Lint** (optional): Validates documentation comments
 * 2. **Bun Build**: Bundles source files using Bun.build()
 * 3. **Declaration Generation**: Runs tsgo for .d.ts files
 * 4. **Declaration Bundling**: Uses API Extractor to roll up declarations
 * 5. **File Copying**: Copies additional assets to output
 * 6. **File Transform** (optional): User-defined post-processing
 * 7. **Package.json Write**: Transforms and writes package.json
 * 8. **Local Path Copy** (optional): Copies API artifacts to local paths
 *
 * @packageDocumentation
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import type { BuildArtifact } from "bun";
import { EntryExtractor } from "../plugins/utils/entry-extractor.js";
import { FileSystemUtils, LocalPathValidator } from "../plugins/utils/file-utils.js";
import type { ImportGraphError } from "../plugins/utils/import-graph.js";
import { ImportGraph } from "../plugins/utils/import-graph.js";
import { BuildLogger } from "../plugins/utils/logger.js";
import { PackageJsonTransformer } from "../plugins/utils/package-json-transformer.js";
import { TsDocConfigBuilder } from "../plugins/utils/tsdoc-config-builder.js";
import type {
	ApiModelOptions,
	BuildResult,
	BuildTarget,
	BunLibraryBuilderOptions,
	CopyPatternConfig,
	TsDocOptions,
} from "../types/builder-types.js";
import type { PackageJson } from "../types/package-json.js";

/**
 * Resolved API model configuration values.
 *
 * @remarks
 * This interface contains the fully resolved configuration for API model
 * generation, with all defaults applied and filenames computed.
 *
 * @internal
 */
export interface ResolvedApiModelConfig {
	/** Whether API model generation is enabled */
	enabled: boolean;
	/** Filename for the API model JSON file */
	filename: string;
	/** Whether TSDoc metadata generation is enabled */
	tsdocMetadataEnabled: boolean;
	/** Filename for the TSDoc metadata file */
	tsdocMetadataFilename: string;
	/** Local paths to copy artifacts to (if any) */
	localPaths: string[];
	/** TSDoc configuration options for tag definitions */
	tsdoc?: TsDocOptions;
}

/**
 * Resolves API model configuration from builder options.
 *
 * @remarks
 * This class centralizes the logic for parsing and resolving `ApiModelOptions`
 * into concrete configuration values. It handles the various forms the options
 * can take (`boolean`, `object`, or `undefined`) and applies appropriate defaults.
 *
 * The resolver is used by both `runApiExtractor` and `executeBuild` to ensure
 * consistent configuration parsing throughout the build pipeline.
 *
 * ## Environment Variable Support
 *
 * The resolver supports the `BUN_BUILDER_LOCAL_PATHS` environment variable for
 * defining local paths without modifying the build configuration. This is useful
 * for developer-specific paths that shouldn't be committed to version control.
 *
 * The environment variable should contain comma-separated paths:
 *
 * ```env
 * BUN_BUILDER_LOCAL_PATHS=../docs/api,../website/packages/my-lib
 * ```
 *
 * Bun automatically loads `.env` files, so you can define this in:
 * - `.env.local` (highest priority, typically gitignored)
 * - `.env.development` or `.env.production` (based on NODE_ENV)
 * - `.env` (lowest priority)
 *
 * When both the environment variable and `apiModel.localPaths` are set, the
 * paths are merged with user-defined paths taking precedence (appearing first).
 *
 * @internal
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Intentional static-only class for API organization
export class ApiModelConfigResolver {
	/**
	 * Environment variable name for defining local paths.
	 *
	 * @remarks
	 * When set, this environment variable provides additional local paths
	 * for copying build artifacts. The value should be comma-separated paths.
	 *
	 * @example
	 * ```env
	 * BUN_BUILDER_LOCAL_PATHS=../docs/api,../website/packages/my-lib
	 * ```
	 */
	static readonly ENV_LOCAL_PATHS = "BUN_BUILDER_LOCAL_PATHS";

	/**
	 * Default filename for TSDoc metadata.
	 */
	static readonly DEFAULT_TSDOC_METADATA_FILENAME = "tsdoc-metadata.json";

	/**
	 * Resolves API model options into a complete configuration object.
	 *
	 * @remarks
	 * Handles the following input forms:
	 * - `undefined`: Returns disabled configuration
	 * - `true`: Returns enabled configuration with all defaults
	 * - `false`: Returns disabled configuration
	 * - `ApiModelOptions`: Merges provided options with defaults
	 *
	 * @param apiModel - The API model options from builder configuration
	 * @param unscopedPackageName - The unscoped package name for default filename
	 * @returns Fully resolved configuration object
	 *
	 * @example
	 * ```typescript
	 * import { ApiModelConfigResolver } from '@savvy-web/bun-builder';
	 * import type { ApiModelOptions } from '@savvy-web/bun-builder';
	 *
	 * // From boolean
	 * const config1 = ApiModelConfigResolver.resolve(true, 'my-package');
	 *
	 * // From options object
	 * const options: ApiModelOptions = {
	 *   filename: 'custom.api.json',
	 *   tsdocMetadata: { filename: 'custom-metadata.json' },
	 * };
	 * const config2 = ApiModelConfigResolver.resolve(options, 'my-package');
	 * ```
	 */
	static resolve(apiModel: ApiModelOptions | boolean | undefined, unscopedPackageName: string): ResolvedApiModelConfig {
		// Get merged local paths (user-defined + environment variable)
		const userLocalPaths = typeof apiModel === "object" && apiModel !== null ? (apiModel.localPaths ?? []) : [];
		const localPaths = ApiModelConfigResolver.resolveLocalPaths(userLocalPaths);

		if (apiModel === undefined || apiModel === false) {
			return {
				enabled: false,
				filename: `${unscopedPackageName}.api.json`,
				tsdocMetadataEnabled: false,
				tsdocMetadataFilename: ApiModelConfigResolver.DEFAULT_TSDOC_METADATA_FILENAME,
				localPaths,
				tsdoc: undefined,
			};
		}

		if (apiModel === true) {
			return {
				enabled: true,
				filename: `${unscopedPackageName}.api.json`,
				tsdocMetadataEnabled: true,
				tsdocMetadataFilename: ApiModelConfigResolver.DEFAULT_TSDOC_METADATA_FILENAME,
				localPaths,
				tsdoc: undefined,
			};
		}

		const enabled = apiModel.enabled !== false;
		const filename = apiModel.filename ?? `${unscopedPackageName}.api.json`;

		const tsdocMetadataOption = apiModel.tsdocMetadata;
		const tsdocMetadataEnabled = ApiModelConfigResolver.resolveTsdocMetadataEnabled(tsdocMetadataOption, enabled);
		const tsdocMetadataFilename = ApiModelConfigResolver.resolveTsdocMetadataFilename(tsdocMetadataOption);

		return {
			enabled,
			filename,
			tsdocMetadataEnabled,
			tsdocMetadataFilename,
			localPaths,
			tsdoc: apiModel.tsdoc,
		};
	}

	/**
	 * Resolves whether TSDoc metadata generation is enabled.
	 *
	 * @remarks
	 * TSDoc metadata defaults to enabled when the API model is enabled,
	 * unless explicitly disabled via the `tsdocMetadata` option.
	 *
	 * @param option - The tsdocMetadata option value
	 * @param apiModelEnabled - Whether the API model itself is enabled
	 * @returns Whether TSDoc metadata should be generated
	 */
	private static resolveTsdocMetadataEnabled(
		option: ApiModelOptions["tsdocMetadata"],
		apiModelEnabled: boolean,
	): boolean {
		if (option === true) {
			return true;
		}
		if (option === false) {
			return false;
		}
		if (typeof option === "object") {
			return option.enabled !== false;
		}
		return apiModelEnabled;
	}

	/**
	 * Resolves the TSDoc metadata filename.
	 *
	 * @param option - The tsdocMetadata option value
	 * @returns The filename to use for TSDoc metadata
	 */
	private static resolveTsdocMetadataFilename(option: ApiModelOptions["tsdocMetadata"]): string {
		if (typeof option === "object" && option.filename) {
			return option.filename;
		}
		return ApiModelConfigResolver.DEFAULT_TSDOC_METADATA_FILENAME;
	}

	/**
	 * Parses local paths from the environment variable.
	 *
	 * @remarks
	 * Reads the `BUN_BUILDER_LOCAL_PATHS` environment variable and parses
	 * it as a comma-separated list of paths. Empty segments are filtered out.
	 *
	 * Bun automatically loads `.env` files before this is called, so paths
	 * can be defined in `.env.local` or other environment files.
	 *
	 * @returns Array of paths from the environment variable, or empty array if not set
	 *
	 * @example
	 * ```typescript
	 * // With BUN_BUILDER_LOCAL_PATHS="../docs/api,../website/lib"
	 * const paths = ApiModelConfigResolver.getEnvLocalPaths();
	 * // Returns: ['../docs/api', '../website/lib']
	 * ```
	 */
	static getEnvLocalPaths(): string[] {
		const envValue = process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS];
		if (!envValue) {
			return [];
		}

		return envValue
			.split(",")
			.map((path) => path.trim())
			.filter((path) => path.length > 0);
	}

	/**
	 * Merges user-defined local paths with environment variable paths.
	 *
	 * @remarks
	 * Combines paths from the `apiModel.localPaths` option with paths from
	 * the `BUN_BUILDER_LOCAL_PATHS` environment variable. User-defined paths
	 * appear first and take precedence. Duplicate paths are removed.
	 *
	 * @param userPaths - Paths defined in the apiModel.localPaths option
	 * @returns Merged array of unique paths
	 *
	 * @example
	 * ```typescript
	 * // With BUN_BUILDER_LOCAL_PATHS="../env/path"
	 * const merged = ApiModelConfigResolver.resolveLocalPaths(['../user/path']);
	 * // Returns: ['../user/path', '../env/path']
	 * ```
	 */
	static resolveLocalPaths(userPaths: string[] = []): string[] {
		const envPaths = ApiModelConfigResolver.getEnvLocalPaths();

		if (userPaths.length === 0 && envPaths.length === 0) {
			return [];
		}

		// User paths first, then env paths, deduplicated
		const allPaths = [...userPaths, ...envPaths];
		return [...new Set(allPaths)];
	}
}

/**
 * Context passed to build lifecycle hooks.
 *
 * @remarks
 * This context is created at the start of each target build and passed through
 * all build phases. It contains all the information needed to execute each phase.
 *
 * @internal
 */
export interface BuildContext {
	/**
	 * The current working directory (project root).
	 *
	 * @remarks
	 * This is typically `process.cwd()` and is used as the base for
	 * all relative path resolution.
	 */
	cwd: string;

	/**
	 * The build target being processed.
	 */
	target: BuildTarget;

	/**
	 * Resolved builder options.
	 */
	options: BunLibraryBuilderOptions;

	/**
	 * Absolute path to the output directory.
	 *
	 * @example `"/path/to/project/dist/npm"`
	 */
	outdir: string;

	/**
	 * Extracted entry points from package.json.
	 *
	 * @remarks
	 * Maps entry names to source file paths.
	 * Keys are bundle names, values are TypeScript source paths.
	 */
	entries: Record<string, string>;

	/**
	 * Entry name to original export key mapping.
	 *
	 * @remarks
	 * Maps entry names back to the original package.json export path
	 * (e.g., `"utils"` → `"./utils"`, `"index"` → `"."`).
	 * Bin entries are not included.
	 */
	exportPaths: Record<string, string>;

	/**
	 * Package version from package.json.
	 */
	version: string;

	/**
	 * Original package.json content.
	 */
	packageJson: PackageJson;
}

/**
 * Result of a single lint message from ESLint.
 * @internal
 */
interface LintMessage {
	/** The file path relative to the project root */
	filePath: string;
	/** Line number (1-indexed) */
	line: number;
	/** Column number (1-indexed) */
	column: number;
	/** The lint message */
	message: string;
	/** The ESLint rule ID */
	ruleId: string | null;
	/** Severity: 1 = warning, 2 = error */
	severity: 1 | 2;
}

/**
 * Result of running TSDoc lint.
 * @internal
 */
interface LintResult {
	/** Total number of errors */
	errorCount: number;
	/** Total number of warnings */
	warningCount: number;
	/** All lint messages */
	messages: LintMessage[];
}

/**
 * Formats lint results for console output.
 *
 * @param results - The lint results to format
 * @param cwd - The current working directory for relative paths
 * @returns Formatted string for console output
 *
 * @internal
 */
function formatLintResults(results: LintResult, cwd: string): string {
	if (results.messages.length === 0) {
		return "";
	}

	const lines: string[] = [];

	// Group messages by file
	const messagesByFile = new Map<string, LintMessage[]>();
	for (const msg of results.messages) {
		const existing = messagesByFile.get(msg.filePath) ?? [];
		existing.push(msg);
		messagesByFile.set(msg.filePath, existing);
	}

	for (const [filePath, messages] of messagesByFile) {
		const relativePath = relative(cwd, filePath);
		lines.push(`  ${relativePath}`);

		for (const msg of messages) {
			const location = `${msg.line}:${msg.column}`;
			const severityLabel = msg.severity === 2 ? "error" : "warning";
			const rule = msg.ruleId ? `(${msg.ruleId})` : "";
			lines.push(`    ${location}  ${severityLabel}  ${msg.message} ${rule}`);
		}
	}

	// Summary line
	const errorText = results.errorCount === 1 ? "error" : "errors";
	const warningText = results.warningCount === 1 ? "warning" : "warnings";

	if (results.errorCount > 0 && results.warningCount > 0) {
		lines.push(`\n  ${results.errorCount} ${errorText}, ${results.warningCount} ${warningText}`);
	} else if (results.errorCount > 0) {
		lines.push(`\n  ${results.errorCount} ${errorText}`);
	} else {
		lines.push(`\n  ${results.warningCount} ${warningText}`);
	}

	return lines.join("\n");
}

/**
 * Internal lint options combining TsDocLintOptions with shared tsdoc config.
 *
 * @internal
 */
interface ResolvedLintOptions {
	enabled?: boolean;
	include?: string[];
	onError?: "warn" | "error" | "throw";
	tsdoc?: TsDocOptions;
}

/**
 * Runs TSDoc lint validation before the build.
 *
 * @remarks
 * Uses ESLint with the `eslint-plugin-tsdoc` plugin to validate documentation
 * comments. Files are discovered from the `include` option if provided, or
 * from entry points otherwise.
 *
 * The function generates a `tsdoc.json` configuration file that can optionally
 * be persisted to the project root for IDE integration.
 *
 * @param context - The build context
 * @param options - Resolved lint configuration options
 * @throws When `onError` is `"throw"` and validation errors are found
 *
 * @internal
 */
export async function runTsDocLint(context: BuildContext, options: ResolvedLintOptions): Promise<void> {
	const logger = BuildLogger.createLogger("tsdoc-lint");

	if (options.enabled === false) {
		return;
	}

	logger.info("Validating TSDoc comments...");

	// Generate tsdoc.json config file
	const tsdocOptions = options.tsdoc ?? {};
	const persistConfig = tsdocOptions.persistConfig;
	const shouldPersist = TsDocConfigBuilder.shouldPersist(persistConfig);
	const tsdocConfigOutputPath = TsDocConfigBuilder.getConfigPath(persistConfig, context.cwd);

	let tsdocConfigPath: string | undefined;
	try {
		tsdocConfigPath = await TsDocConfigBuilder.writeConfigFile(tsdocOptions, tsdocConfigOutputPath);
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.warn(`Failed to generate tsdoc.json: ${errorMessage}`);
	}

	// Dynamic import ESLint and plugins
	const eslintModule = await import("eslint");
	const tsParserModule = await import("@typescript-eslint/parser");
	const tsdocPluginModule = await import("eslint-plugin-tsdoc");

	const { ESLint } = eslintModule;
	const tsParser = (tsParserModule as { default?: unknown }).default ?? tsParserModule;
	const tsdocPlugin = (tsdocPluginModule as { default?: unknown }).default ?? tsdocPluginModule;

	// Determine files to lint
	let filesToLint: string[];
	let isGlobPattern: boolean;
	let discoveryErrors: ImportGraphError[] = [];

	if (options.include && options.include.length > 0) {
		// User provided explicit patterns
		filesToLint = options.include.filter((p) => !p.startsWith("!"));
		isGlobPattern = true;
	} else {
		// Default: discover files from package.json exports using import graph
		const packageJsonPath = join(context.cwd, "package.json");
		const graph = new ImportGraph({ rootDir: context.cwd });
		const result = graph.traceFromPackageExports(packageJsonPath);

		filesToLint = result.files;
		discoveryErrors = result.errors;
		isGlobPattern = false;

		// Log any discovery warnings
		for (const error of discoveryErrors) {
			logger.warn(error.message);
		}
	}

	if (filesToLint.length === 0) {
		logger.info("No files to lint");
		return;
	}

	// Build ESLint config
	const ignorePatterns = options.include?.filter((p) => p.startsWith("!")).map((p) => p.slice(1)) ?? [];

	const eslint = new ESLint({
		cwd: context.cwd,
		overrideConfigFile: true,
		overrideConfig: [
			{
				ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**", ...ignorePatterns],
			},
			{
				files: isGlobPattern ? filesToLint : ["**/*.ts", "**/*.tsx"],
				languageOptions: {
					parser: tsParser as Parameters<typeof ESLint.prototype.lintFiles>[0],
				},
				plugins: { tsdoc: tsdocPlugin as Record<string, unknown> },
				rules: {
					"tsdoc/syntax": "error" as const,
				},
			},
		],
	});

	const eslintResults = await eslint.lintFiles(filesToLint);

	// Convert ESLint results to our format
	const messages: LintMessage[] = [];
	let errorCount = 0;
	let warningCount = 0;

	for (const result of eslintResults) {
		for (const msg of result.messages) {
			messages.push({
				filePath: result.filePath,
				line: msg.line,
				column: msg.column,
				message: msg.message,
				ruleId: msg.ruleId,
				severity: msg.severity as 1 | 2,
			});

			if (msg.severity === 2) {
				errorCount++;
			} else {
				warningCount++;
			}
		}
	}

	const results: LintResult = { errorCount, warningCount, messages };

	// Clean up temp config if not persisting
	if (!shouldPersist && tsdocConfigPath) {
		try {
			const { unlink } = await import("node:fs/promises");
			await unlink(tsdocConfigPath);
		} catch {
			// Ignore cleanup errors
		}
	}

	if (errorCount === 0 && warningCount === 0) {
		logger.success("All TSDoc comments are valid");
		return;
	}

	// Format and handle results
	const formatted = formatLintResults(results, context.cwd);
	const onError = options.onError ?? (BuildLogger.isCI() ? "throw" : "error");

	if (errorCount > 0) {
		if (onError === "throw") {
			throw new Error(`TSDoc validation failed:\n${formatted}`);
		} else if (onError === "error") {
			logger.error(`TSDoc validation errors:\n${formatted}`);
		} else {
			logger.warn(`TSDoc validation warnings:\n${formatted}`);
		}
	} else if (warningCount > 0) {
		logger.warn(`TSDoc validation warnings:\n${formatted}`);
	}
}

/**
 * Runs the Bun.build() bundling phase.
 *
 * @remarks
 * Executes Bun.build() with the following configuration:
 * - Target: Node.js
 * - Format: ESM
 * - Splitting: Disabled (single-file outputs)
 * - Source maps: Linked for dev, none for npm
 * - Minification: Disabled
 *
 * Entry points are derived from the context's `entries` map.
 *
 * @param context - The build context containing entries and options
 * @returns Object with `outputs` array and `success` boolean
 *
 * @internal
 */
export async function runBunBuild(context: BuildContext): Promise<{ outputs: BuildArtifact[]; success: boolean }> {
	const logger = BuildLogger.createEnvLogger(context.target);
	const timer = BuildLogger.createTimer();

	logger.info("build started...");

	const entrypoints = Object.values(context.entries).map((entry) =>
		entry.startsWith("./") ? join(context.cwd, entry) : entry,
	);

	// Build externals array from options
	const external: string[] = [];
	if (context.options.externals) {
		for (const ext of context.options.externals) {
			if (typeof ext === "string") {
				external.push(ext);
			} else if (ext instanceof RegExp) {
				// Bun doesn't support RegExp externals directly, convert to string pattern
				external.push(ext.source);
			}
		}
	}

	let result: Awaited<ReturnType<typeof Bun.build>>;

	try {
		result = await Bun.build({
			entrypoints,
			outdir: context.outdir,
			target: context.options.bunTarget ?? "bun",
			format: "esm",
			splitting: false,
			sourcemap: context.target === "dev" ? "linked" : "none",
			minify: false,
			external,
			// Use "external" to keep dependencies external (like RSLib's autoExternal)
			// This prevents bundling node_modules and keeps the output small
			packages: "external",
			// Use [dir] to preserve directory structure and avoid collisions
			// when multiple entry points have the same filename
			naming: "[dir]/[name].[ext]",
			define: {
				"process.env.__PACKAGE_VERSION__": JSON.stringify(context.version),
				...context.options.define,
			},
			plugins: context.options.plugins,
		});
	} catch (error) {
		// Handle AggregateError thrown by Bun.build() for detailed error messages
		if (error instanceof AggregateError && error.errors) {
			logger.error("Bun.build() failed:");
			for (const err of error.errors) {
				const msg = err.message || String(err);
				logger.error(`  ${msg}`);
				// Log file position if available
				if (err.position?.file) {
					const pos = err.position;
					logger.error(`    at ${pos.file}:${pos.line}:${pos.column}`);
					if (pos.lineText) {
						logger.error(`    ${pos.lineText}`);
					}
				}
			}
		} else {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error(`Bun.build() failed: ${errorMessage}`);
		}
		return { outputs: [], success: false };
	}

	if (!result.success) {
		logger.error("Bun.build() failed:");
		for (const log of result.logs) {
			logger.error(`  ${String(log)}`);
		}
		return { outputs: [], success: false };
	}

	// Post-process: Rename outputs to match entry names
	//
	// Problem: Bun.build() with [dir]/[name].[ext] naming creates output paths based on
	// the source file structure (e.g., "cli/index.js" from "src/cli/index.ts"), but
	// package.json expects paths matching our entry names (e.g., "bin/my-cli.js" from
	// entry "bin/my-cli"). We need to rename outputs to match entry names.
	//
	// Example:
	//   Entry: "bin/claude-plugin" => "./src/cli/index.ts"
	//   Bun outputs: "cli/index.js" (based on source path)
	//   We rename to: "bin/claude-plugin.js" (based on entry name)
	const renamedOutputs: BuildArtifact[] = [];
	const sourceToEntryName = new Map<string, string>();

	for (const [name, source] of Object.entries(context.entries)) {
		// Normalize source path to match what Bun uses (strip ./ prefix and extension)
		const normalizedSource = source.replace(/^\.\//, "").replace(/\.tsx?$/, "");
		sourceToEntryName.set(normalizedSource, name);
	}

	for (const output of result.outputs) {
		const relativePath = relative(context.outdir, output.path);
		const relativeWithoutExt = relativePath.replace(/\.(js|map)$/, "");

		// Match output path to an entry by trying multiple normalizations of the source path.
		// This handles the mismatch between what Bun outputs and what our entries expect.
		let entryName: string | undefined;
		let bestMatchLength = 0;

		for (const [source, name] of sourceToEntryName) {
			// Generate path variants to handle different Bun output structures:
			// - Full path: "src/cli/index" (when Bun preserves full structure)
			// - Without src: "cli/index" (when Bun strips src/ prefix)
			// - Without index: "src/cli" (when Bun uses directory name)
			// - Minimal: "cli" (when Bun strips both src/ and /index)
			// Empty strings are filtered to prevent false matches (endsWith("") is always true)
			const variants = [
				source, // e.g., "src/cli/index"
				source.replace(/^src\//, ""), // e.g., "cli/index"
				source.replace(/\/index$/, ""), // e.g., "src/cli"
				source.replace(/^src\//, "").replace(/\/index$/, ""), // e.g., "cli"
			].filter((v) => v.length > 0);

			for (const variant of variants) {
				// Use longest-match strategy to prevent ambiguous matches.
				// E.g., "cli/index" should match entry with source "src/cli/index",
				// not a shorter match like "index" from another entry.
				if (variant === relativeWithoutExt) {
					entryName = name;
					bestMatchLength = variant.length;
					break;
				}
				if (relativeWithoutExt.endsWith(variant) && variant.length > bestMatchLength) {
					entryName = name;
					bestMatchLength = variant.length;
				}
			}
			if (bestMatchLength === relativeWithoutExt.length) break; // Found exact match
		}

		if (entryName && entryName !== relativeWithoutExt) {
			const ext = relativePath.endsWith(".map") ? ".js.map" : ".js";
			const newPath = join(context.outdir, `${entryName}${ext}`);
			const newDir = dirname(newPath);

			// Ensure directory exists
			await mkdir(newDir, { recursive: true });

			// Rename file
			const { rename } = await import("node:fs/promises");
			await rename(output.path, newPath);

			// Update output artifact
			renamedOutputs.push({
				...output,
				path: newPath,
			});
		} else {
			renamedOutputs.push(output);
		}
	}

	// Clean up empty directories left after renaming
	const { rmdir } = await import("node:fs/promises");
	for (const output of result.outputs) {
		const dir = dirname(output.path);
		try {
			await rmdir(dir);
		} catch {
			// Directory not empty or doesn't exist, ignore
		}
	}

	logger.info(`Bundled ${renamedOutputs.length} file(s) in ${BuildLogger.formatTime(timer.elapsed())}`);

	return { outputs: renamedOutputs, success: true };
}

/**
 * Runs tsgo to generate TypeScript declaration files.
 *
 * @remarks
 * Uses the TSConfigs system to create a properly configured temporary tsconfig,
 * then runs tsgo with declaration generation flags. The generated declarations
 * are placed in the specified temporary directory for subsequent bundling.
 *
 * Before running, any existing `.tsbuildinfo` files are removed to force
 * a fresh build, which is necessary for composite projects.
 *
 * @param context - The build context
 * @param tempDtsDir - Directory to output generated declaration files
 * @returns `true` if generation succeeded, `false` otherwise
 *
 * @internal
 */
export async function runTsgoGeneration(context: BuildContext, tempDtsDir: string): Promise<boolean> {
	const logger = BuildLogger.createEnvLogger(context.target);
	const timer = BuildLogger.createTimer();

	logger.info("Generating declaration files...");

	const tsgoBinPath = FileSystemUtils.getTsgoBinPath();

	// Delete tsbuildinfo files to force rebuild (needed for composite projects)
	// Without this, tsgo may skip generation if it thinks nothing changed
	const distDir = join(context.cwd, "dist");
	if (existsSync(distDir)) {
		const tsbuildInfoGlob = new Bun.Glob(".tsbuildinfo*");
		// dot: true is required to match files starting with "."
		for await (const file of tsbuildInfoGlob.scan({ cwd: distDir, absolute: true, dot: true })) {
			await rm(file, { force: true }).catch(() => {});
		}
	}

	// Use the existing TSConfigs system to create a properly configured temp tsconfig
	const { TSConfigs } = await import("../tsconfig/index.js");
	const tempTsconfigPath = TSConfigs.node.ecma.lib.writeBundleTempConfig(context.target);

	// Run tsgo with declaration generation flags
	// The temp config has emitDeclarationOnly: false, so we override via CLI
	const args = [
		"--project",
		tempTsconfigPath,
		"--declaration",
		"--emitDeclarationOnly",
		"--declarationDir",
		tempDtsDir,
	];

	return new Promise((resolve) => {
		const child = spawn(tsgoBinPath, args, {
			cwd: context.cwd,
			stdio: ["inherit", "pipe", "pipe"],
			shell: false,
		});

		let stderr = "";

		child.stdout?.on("data", (data: Buffer) => {
			const text = data.toString().trim();
			if (text) logger.info(text);
		});

		child.stderr?.on("data", (data: Buffer) => {
			stderr += data.toString();
		});

		child.on("close", (code) => {
			if (code === 0) {
				logger.info(`Generated declarations in ${BuildLogger.formatTime(timer.elapsed())}`);
				resolve(true);
			} else {
				logger.error(`tsgo failed with code ${code}`);
				if (stderr) logger.error(stderr);
				resolve(false);
			}
		});

		child.on("error", (err) => {
			logger.error(`Failed to spawn tsgo: ${err.message}`);
			resolve(false);
		});
	});
}

/**
 * Copies unbundled declaration files to the output directory.
 *
 * @remarks
 * This is a fallback mechanism used when API Extractor is unavailable or fails.
 * It copies individual `.d.ts` files from the temporary directory to the output,
 * stripping any `src/` prefix from the paths.
 *
 * @param context - The build context
 * @param tempDtsDir - Directory containing generated declaration files
 * @returns Object containing array of copied declaration file paths
 *
 * @internal
 */
async function copyUnbundledDeclarations(context: BuildContext, tempDtsDir: string): Promise<{ dtsFiles: string[] }> {
	const logger = BuildLogger.createEnvLogger(context.target);

	// Find all .d.ts files in the temp directory using Bun.Glob
	const dtsGlob = new Bun.Glob("**/*.d.ts");
	const dtsFiles: string[] = [];
	for await (const file of dtsGlob.scan({ cwd: tempDtsDir })) {
		dtsFiles.push(file);
	}
	const copiedFiles: string[] = [];

	for (const file of dtsFiles) {
		const srcPath = join(tempDtsDir, file);
		// Remove 'src/' prefix from output path if present
		const destFile = file.startsWith("src/") ? file.replace(/^src\//, "") : file;
		const destPath = join(context.outdir, destFile);

		await mkdir(dirname(destPath), { recursive: true });
		await copyFile(srcPath, destPath);
		copiedFiles.push(destFile);
	}

	logger.info(`Copied ${copiedFiles.length} unbundled declaration file(s)`);
	return { dtsFiles: copiedFiles };
}

/**
 * Resolves a declaration file path from a source entry path.
 *
 * @param sourcePath - The TypeScript source file path (e.g., "./src/index.ts")
 * @param tempDtsDir - The temporary directory containing generated .d.ts files
 * @returns The resolved path if found, otherwise undefined
 *
 * @internal
 */
function resolveDtsPath(sourcePath: string, tempDtsDir: string): string | undefined {
	const normalizedPath = sourcePath.replace(/^\.\//, "").replace(/\.tsx?$/, ".d.ts");
	let tempDtsPath = join(tempDtsDir, normalizedPath);

	// If source was in src/, check both with and without src/ prefix
	if (!existsSync(tempDtsPath) && normalizedPath.startsWith("src/")) {
		const withoutSrc = normalizedPath.replace(/^src\//, "");
		const altPath = join(tempDtsDir, withoutSrc);
		if (existsSync(altPath)) {
			tempDtsPath = altPath;
		}
	}

	return existsSync(tempDtsPath) ? tempDtsPath : undefined;
}

/**
 * Merges per-entry API models into a single Package with multiple EntryPoint members.
 *
 * @remarks
 * Each per-entry API model is a Package whose `members` array contains a single
 * EntryPoint. This function extracts the EntryPoints, rewrites canonical references
 * for sub-entries, and combines them into a single Package with all EntryPoints.
 *
 * @param options - Merge options
 * @returns Merged API model with multiple EntryPoint members
 *
 * @internal
 */
export function mergeApiModels(options: {
	perEntryModels: Map<string, Record<string, unknown>>;
	packageName: string;
	exportPaths: Record<string, string>;
}): Record<string, unknown> {
	const { perEntryModels, packageName, exportPaths } = options;

	if (perEntryModels.size === 0) {
		throw new Error("Cannot merge zero API models");
	}

	// Use the first model as the base (deep clone)
	const firstModel = perEntryModels.values().next().value as Record<string, unknown>;
	const merged = JSON.parse(JSON.stringify(firstModel)) as Record<string, unknown>;

	// Collect all EntryPoint members from each per-entry model
	const entryPointMembers: unknown[] = [];

	for (const [entryName, model] of perEntryModels) {
		const entryPoints = model.members as unknown[];
		if (!entryPoints || entryPoints.length === 0) continue;

		// Each per-entry model has one EntryPoint in Package.members
		const entryPoint = JSON.parse(JSON.stringify(entryPoints[0])) as Record<string, unknown>;

		// Determine the export path for this entry
		const exportPath = exportPaths[entryName] ?? (entryName === "index" ? "." : `./${entryName}`);
		const isMainEntry = exportPath === ".";

		if (isMainEntry) {
			// Main entry: keep canonical reference as @scope/package!, name ""
			entryPointMembers.unshift(entryPoint);
		} else {
			// Sub-entry: rewrite canonical reference to @scope/package/subpath!
			const subpath = exportPath.replace(/^\.\//, "");
			const originalPrefix = `${packageName}!`;
			const newPrefix = `${packageName}/${subpath}!`;

			entryPoint.canonicalReference = newPrefix;
			entryPoint.name = subpath;

			// Rewrite all canonical references within the entry point's member tree
			rewriteCanonicalReferences(entryPoint, originalPrefix, newPrefix);

			entryPointMembers.push(entryPoint);
		}
	}

	// Replace the Package's members with all EntryPoints
	merged.members = entryPointMembers;

	return merged;
}

/**
 * Recursively rewrites canonical reference strings within an API model member tree.
 *
 * @internal
 */
function rewriteCanonicalReferences(node: unknown, originalPrefix: string, newPrefix: string): void {
	if (!node || typeof node !== "object") return;

	if (Array.isArray(node)) {
		for (const item of node) {
			rewriteCanonicalReferences(item, originalPrefix, newPrefix);
		}
		return;
	}

	const obj = node as Record<string, unknown>;

	// Rewrite canonicalReference on members (but not on the EntryPoint itself — already handled)
	if (typeof obj.canonicalReference === "string" && obj.kind !== "EntryPoint") {
		const ref = obj.canonicalReference as string;
		if (ref.startsWith(originalPrefix)) {
			obj.canonicalReference = ref.replace(originalPrefix, newPrefix);
		}
	}

	// Recurse into members array
	if (Array.isArray(obj.members)) {
		for (const member of obj.members) {
			rewriteCanonicalReferences(member, originalPrefix, newPrefix);
		}
	}
}

/**
 * Bundles declarations with API Extractor for all entry points.
 *
 * @remarks
 * Runs API Extractor per entry point to produce per-entry bundled `.d.ts` files.
 * When API model generation is enabled, per-entry models are merged into a single
 * model with multiple EntryPoint members and rewritten canonical references.
 *
 * If API Extractor is not installed or fails, falls back to copying
 * unbundled declarations via {@link copyUnbundledDeclarations}.
 *
 * @param context - The build context
 * @param tempDtsDir - Directory containing generated declaration files
 * @param apiModel - API model generation options (only for npm target)
 * @returns Object containing paths to bundled declarations, API model, etc.
 *
 * @internal
 */
export async function runApiExtractor(
	context: BuildContext,
	tempDtsDir: string,
	apiModel?: ApiModelOptions | boolean,
): Promise<{
	bundledDtsPaths?: string[];
	apiModelPath?: string;
	tsdocMetadataPath?: string;
	tsconfigPath?: string;
	tsdocConfigPath?: string;
	dtsFiles?: string[];
}> {
	const logger = BuildLogger.createEnvLogger(context.target);
	const timer = BuildLogger.createTimer();

	// Validate API Extractor is installed
	try {
		FileSystemUtils.getApiExtractorPath();
	} catch {
		logger.warn("API Extractor not found, copying unbundled declarations");
		const { dtsFiles } = await copyUnbundledDeclarations(context, tempDtsDir);
		return { dtsFiles };
	}

	// Filter entries to only export entries (skip bin entries)
	const exportEntries = Object.entries(context.entries).filter(([name]) => !name.startsWith("bin/"));
	if (exportEntries.length === 0) {
		logger.warn("No export entry points found for API Extractor");
		const { dtsFiles } = await copyUnbundledDeclarations(context, tempDtsDir);
		return { dtsFiles };
	}

	// Resolve API model configuration using the centralized resolver
	const unscopedName = FileSystemUtils.getUnscopedPackageName(context.packageJson.name ?? "package");
	const apiModelConfig = ApiModelConfigResolver.resolve(apiModel, unscopedName);

	// Resolve forgottenExports behavior
	const forgottenExportsOption =
		(typeof apiModel === "object" && apiModel !== null ? apiModel.forgottenExports : undefined) ??
		(BuildLogger.isCI() ? "error" : "include");

	// Ensure output directory exists
	await mkdir(context.outdir, { recursive: true });

	try {
		// Import API Extractor dynamically
		const { Extractor, ExtractorConfig } = await import("@microsoft/api-extractor");

		const bundledDtsPaths: string[] = [];
		const perEntryModels = new Map<string, Record<string, unknown>>();
		let lastTsdocMetadataPath: string | undefined;
		const collectedForgottenExports: { text: string; entryName: string }[] = [];

		// Run API Extractor per entry
		for (const [entryName, sourcePath] of exportEntries) {
			const tempDtsPath = resolveDtsPath(sourcePath, tempDtsDir);
			if (!tempDtsPath) {
				logger.warn(`Declaration file not found for entry "${entryName}", skipping`);
				continue;
			}

			// Determine output filename: "index" -> "index.d.ts", "utils" -> "utils.d.ts"
			const dtsFilename = `${entryName}.d.ts`;
			const bundledDtsPath = join(context.outdir, dtsFilename);
			await mkdir(dirname(bundledDtsPath), { recursive: true });

			// For API model, write per-entry JSON to a temp location
			const perEntryApiModelPath = apiModelConfig.enabled
				? join(context.outdir, `.tmp-${entryName.replace(/\//g, "-")}.api.json`)
				: undefined;

			const tsdocMetadataPath = apiModelConfig.tsdocMetadataEnabled
				? join(context.outdir, apiModelConfig.tsdocMetadataFilename)
				: undefined;

			const extractorConfig = ExtractorConfig.prepare({
				configObject: {
					projectFolder: context.cwd,
					mainEntryPointFilePath: tempDtsPath,
					compiler: {
						tsconfigFilePath: context.options.tsconfigPath ?? join(context.cwd, "tsconfig.json"),
					},
					dtsRollup: {
						enabled: true,
						untrimmedFilePath: bundledDtsPath,
					},
					docModel: perEntryApiModelPath
						? {
								enabled: true,
								apiJsonFilePath: perEntryApiModelPath,
							}
						: { enabled: false },
					tsdocMetadata: tsdocMetadataPath
						? {
								enabled: true,
								tsdocMetadataFilePath: tsdocMetadataPath,
							}
						: { enabled: false },
					apiReport: {
						enabled: false,
					},
					bundledPackages: context.options.dtsBundledPackages ?? [],
				},
				packageJsonFullPath: join(context.cwd, "package.json"),
				configObjectFullPath: undefined,
			});

			const extractorResult = Extractor.invoke(extractorConfig, {
				localBuild: true,
				showVerboseMessages: false,
				messageCallback: (message: { text?: string; logLevel?: string; messageId?: string }) => {
					// Suppress TypeScript version mismatch warnings
					if (
						message.text?.includes("Analysis will use the bundled TypeScript version") ||
						message.text?.includes("The target project appears to use TypeScript")
					) {
						message.logLevel = "none";
						return;
					}

					// Suppress API signature change warnings
					if (message.text?.includes("You have changed the public API signature")) {
						message.logLevel = "none";
						return;
					}

					// Suppress TSDoc warnings (they can be noisy)
					if (message.messageId?.startsWith("tsdoc-")) {
						message.logLevel = "none";
						return;
					}

					// Handle forgotten export messages
					if (message.messageId === "ae-forgotten-export" && message.text) {
						collectedForgottenExports.push({ text: message.text, entryName });
						message.logLevel = "none";
						return;
					}
				},
			});

			if (!extractorResult.succeeded) {
				logger.warn(`API Extractor failed for entry "${entryName}", skipping`);
				continue;
			}

			bundledDtsPaths.push(bundledDtsPath);

			if (tsdocMetadataPath && existsSync(tsdocMetadataPath)) {
				lastTsdocMetadataPath = tsdocMetadataPath;
			}

			// Read per-entry API model for merging
			if (perEntryApiModelPath && existsSync(perEntryApiModelPath)) {
				const modelContent = await readFile(perEntryApiModelPath, "utf-8");
				perEntryModels.set(entryName, JSON.parse(modelContent) as Record<string, unknown>);
			}
		}

		if (bundledDtsPaths.length === 0) {
			logger.warn("API Extractor failed for all entries, copying unbundled declarations");
			const { dtsFiles } = await copyUnbundledDeclarations(context, tempDtsDir);
			return { dtsFiles };
		}

		// Process collected forgotten export messages
		if (collectedForgottenExports.length > 0) {
			const messages = collectedForgottenExports.map((m) => `  [${m.entryName}] ${m.text}`).join("\n");

			if (forgottenExportsOption === "error") {
				throw new Error(`Forgotten exports detected:\n${messages}`);
			}
			if (forgottenExportsOption === "include") {
				logger.warn(`Forgotten exports detected:\n${messages}`);
			}
			// "ignore": do nothing
		}

		logger.info(
			`Emitted ${bundledDtsPaths.length} bundled declaration file(s) in ${BuildLogger.formatTime(timer.elapsed())}`,
		);

		// Merge per-entry API models if there are multiple entries
		let apiModelPath: string | undefined;
		if (apiModelConfig.enabled && perEntryModels.size > 0) {
			apiModelPath = join(context.outdir, apiModelConfig.filename);
			const packageName = context.packageJson.name ?? "package";

			if (perEntryModels.size === 1) {
				// Single entry: write directly
				const [, model] = perEntryModels.entries().next().value as [string, Record<string, unknown>];
				await writeFile(apiModelPath, `${JSON.stringify(model, null, "\t")}\n`);
			} else {
				// Multiple entries: merge
				const merged = mergeApiModels({
					perEntryModels,
					packageName,
					exportPaths: context.exportPaths,
				});
				await writeFile(apiModelPath, `${JSON.stringify(merged, null, "\t")}\n`);
			}

			logger.success(`Emitted API model: ${basename(apiModelPath)} (excluded from npm publish)`);

			// Clean up temp per-entry API model files
			for (const [entryName] of perEntryModels) {
				const tempPath = join(context.outdir, `.tmp-${entryName.replace(/\//g, "-")}.api.json`);
				await rm(tempPath, { force: true }).catch(() => {});
			}
		}

		if (lastTsdocMetadataPath && existsSync(lastTsdocMetadataPath)) {
			logger.success(`Emitted TSDoc metadata: ${basename(lastTsdocMetadataPath)}`);
		}

		// Generate resolved tsconfig.json for virtual TypeScript environments
		let tsconfigPath: string | undefined;
		if (apiModelConfig.enabled) {
			try {
				const ts = await import("typescript");
				const { TsconfigResolver } = await import("../plugins/utils/tsconfig-resolver.js");

				const tsconfigFilePath = context.options.tsconfigPath ?? join(context.cwd, "tsconfig.json");
				const configFile = ts.readConfigFile(tsconfigFilePath, ts.sys.readFile.bind(ts.sys));

				if (!configFile.error) {
					const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, context.cwd);
					const resolver = new TsconfigResolver();
					const resolved = resolver.resolve(parsed, context.cwd);

					tsconfigPath = join(context.outdir, "tsconfig.json");
					await writeFile(tsconfigPath, `${JSON.stringify(resolved, null, "\t")}\n`);
					logger.success(`Emitted tsconfig.json (excluded from npm publish)`);
				}
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				logger.warn(`Failed to generate tsconfig.json: ${errorMessage}`);
			}
		}

		// Generate tsdoc.json in dist for documentation tools
		let tsdocConfigPath: string | undefined;
		if (apiModelConfig.enabled) {
			try {
				tsdocConfigPath = await TsDocConfigBuilder.writeConfigFile(apiModelConfig.tsdoc ?? {}, context.outdir);
				logger.success(`Emitted tsdoc.json (excluded from npm publish)`);
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				logger.warn(`Failed to generate tsdoc.json: ${errorMessage}`);
			}
		}

		return {
			bundledDtsPaths,
			apiModelPath,
			tsdocMetadataPath: lastTsdocMetadataPath,
			tsconfigPath,
			tsdocConfigPath,
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		logger.warn(`API Extractor error: ${errorMessage}, copying unbundled declarations`);
		const { dtsFiles } = await copyUnbundledDeclarations(context, tempDtsDir);
		return { dtsFiles };
	}
}

/**
 * Transforms and writes package.json to the output directory.
 *
 * @remarks
 * Applies the following transformations:
 * - Resolves `catalog:` and `workspace:` references (npm target only)
 * - Transforms export paths from TypeScript to JavaScript
 * - Strips source directory prefixes
 * - Removes `publishConfig` and `scripts` fields
 * - Applies user-defined transform function
 * - Sets `private: true` for dev target
 * - Adds the `files` array
 *
 * @param context - The build context
 * @param filesArray - Set of files to include in the package.json `files` field
 *
 * @internal
 */
export async function writePackageJson(context: BuildContext, filesArray: Set<string>): Promise<void> {
	const isProduction = context.target === "npm";

	// Build the user transform function
	const userTransform = context.options.transform;
	const transformFn = userTransform
		? (pkg: PackageJson): PackageJson => userTransform({ target: context.target, pkg })
		: undefined;

	const transformed = await PackageJsonTransformer.build(context.packageJson, {
		isProduction,
		processTSExports: true,
		bundle: true,
		transform: transformFn,
	});

	// Set private flag for dev target
	if (context.target === "dev") {
		transformed.private = true;
	}

	// Add files array
	const files = Array.from(filesArray).sort();
	transformed.files = files;

	// Write to output directory
	const outputPath = join(context.outdir, "package.json");
	await writeFile(outputPath, `${JSON.stringify(transformed, null, "\t")}\n`);
}

/**
 * Copies additional files to the output directory.
 *
 * @remarks
 * Processes copy patterns to copy files and directories to the output.
 * Handles both single files and directories (copied recursively).
 *
 * @param context - The build context
 * @param patterns - Array of file paths or copy pattern configurations
 * @returns Array of paths (relative to output directory) that were copied
 *
 * @internal
 */
export async function copyFiles(context: BuildContext, patterns: (string | CopyPatternConfig)[]): Promise<string[]> {
	const logger = BuildLogger.createEnvLogger(context.target);
	const copiedFiles: string[] = [];

	for (const pattern of patterns) {
		const config = typeof pattern === "string" ? { from: pattern } : pattern;

		const fromPath = join(context.cwd, config.from);
		const toPath = join(context.outdir, config.to ?? ".");

		if (!existsSync(fromPath)) {
			if (!config.noErrorOnMissing) {
				logger.warn(`Copy source not found: ${config.from}`);
			}
			continue;
		}

		// Determine if source is a file or directory
		const stat = await import("node:fs/promises").then((m) => m.stat(fromPath));

		if (stat.isDirectory()) {
			// Copy directory recursively using Bun.Glob
			const dirGlob = new Bun.Glob("**/*");
			const files: string[] = [];
			for await (const file of dirGlob.scan({ cwd: fromPath, onlyFiles: true })) {
				files.push(file);
			}

			for (const file of files) {
				const srcFile = join(fromPath, file);
				const destFile = join(toPath, file);
				await mkdir(dirname(destFile), { recursive: true });
				await copyFile(srcFile, destFile);
				copiedFiles.push(relative(context.outdir, destFile));
			}
		} else {
			// Copy single file
			const destFile = stat.isFile()
				? join(toPath, config.to ? "" : require("node:path").basename(config.from))
				: toPath;
			await mkdir(dirname(destFile), { recursive: true });
			await copyFile(fromPath, destFile);
			copiedFiles.push(relative(context.outdir, destFile));
		}
	}

	return copiedFiles;
}

/**
 * File descriptor for copying operations.
 *
 * @internal
 */
interface CopyFileDescriptor {
	/** Absolute source path */
	src: string;
	/** Absolute destination path */
	dest: string;
	/** Display name for logging */
	name: string;
}

/**
 * Manages copying of build artifacts to local paths.
 *
 * @remarks
 * This class encapsulates the logic for copying API documentation artifacts
 * (API model, TSDoc metadata, and package.json) to specified local directories.
 * It is used to support documentation generation workflows where artifacts need
 * to be available outside the standard build output directory.
 *
 * The copier only operates during `npm` target builds and is skipped in CI
 * environments to avoid side effects during automated builds.
 *
 * @internal
 */
export class LocalPathCopier {
	private readonly context: BuildContext;
	private readonly apiModelFilename: string;
	private readonly tsdocMetadataFilename: string;
	private readonly tsconfigFilename: string;
	private readonly tsdocConfigFilename: string;

	/**
	 * Creates a new LocalPathCopier instance.
	 *
	 * @param context - The build context containing cwd and outdir
	 * @param config - Configuration specifying artifact filenames
	 */
	constructor(
		context: BuildContext,
		config: {
			apiModelFilename: string;
			tsdocMetadataFilename: string;
			tsconfigFilename?: string;
			tsdocConfigFilename?: string;
		},
	) {
		this.context = context;
		this.apiModelFilename = config.apiModelFilename;
		this.tsdocMetadataFilename = config.tsdocMetadataFilename;
		this.tsconfigFilename = config.tsconfigFilename ?? "tsconfig.json";
		this.tsdocConfigFilename = config.tsdocConfigFilename ?? "tsdoc.json";
	}

	/**
	 * Copies build artifacts to multiple local paths.
	 *
	 * @remarks
	 * For each specified path, copies the following files if they exist:
	 * - API model JSON file (e.g., `my-package.api.json`)
	 * - TSDoc metadata file (e.g., `tsdoc-metadata.json`)
	 * - TSDoc configuration file (`tsdoc.json`)
	 * - Resolved `tsconfig.json` for virtual TypeScript environments
	 * - Transformed `package.json`
	 *
	 * Destination directories are created if they do not exist.
	 *
	 * @param localPaths - Array of relative paths to copy artifacts to
	 */
	async copyToLocalPaths(localPaths: string[]): Promise<void> {
		const logger = BuildLogger.createEnvLogger(this.context.target);

		for (const localPath of localPaths) {
			const resolvedPath = join(this.context.cwd, localPath);
			const filesToCopy = this.collectFilesToCopy(resolvedPath);

			if (filesToCopy.length === 0) {
				continue;
			}

			await mkdir(resolvedPath, { recursive: true });

			for (const file of filesToCopy) {
				await copyFile(file.src, file.dest);
			}

			const fileNames = filesToCopy.map((f) => f.name).join(", ");
			logger.info(`Copied ${fileNames} to: ${localPath}`);
		}
	}

	/**
	 * Collects file descriptors for all artifacts that exist in the output directory.
	 *
	 * @param destinationDir - The resolved destination directory path
	 * @returns Array of file descriptors for existing artifacts
	 */
	private collectFilesToCopy(destinationDir: string): CopyFileDescriptor[] {
		const files: CopyFileDescriptor[] = [];

		const apiModelSrc = join(this.context.outdir, this.apiModelFilename);
		if (existsSync(apiModelSrc)) {
			files.push({
				src: apiModelSrc,
				dest: join(destinationDir, this.apiModelFilename),
				name: this.apiModelFilename,
			});
		}

		const tsdocSrc = join(this.context.outdir, this.tsdocMetadataFilename);
		if (existsSync(tsdocSrc)) {
			files.push({
				src: tsdocSrc,
				dest: join(destinationDir, this.tsdocMetadataFilename),
				name: this.tsdocMetadataFilename,
			});
		}

		const tsconfigSrc = join(this.context.outdir, this.tsconfigFilename);
		if (existsSync(tsconfigSrc)) {
			files.push({
				src: tsconfigSrc,
				dest: join(destinationDir, this.tsconfigFilename),
				name: this.tsconfigFilename,
			});
		}

		const tsdocConfigSrc = join(this.context.outdir, this.tsdocConfigFilename);
		if (existsSync(tsdocConfigSrc)) {
			files.push({
				src: tsdocConfigSrc,
				dest: join(destinationDir, this.tsdocConfigFilename),
				name: this.tsdocConfigFilename,
			});
		}

		const packageJsonSrc = join(this.context.outdir, "package.json");
		if (existsSync(packageJsonSrc)) {
			files.push({
				src: packageJsonSrc,
				dest: join(destinationDir, "package.json"),
				name: "package.json",
			});
		}

		return files;
	}
}

/**
 * Executes the complete build lifecycle for a single target.
 *
 * @remarks
 * This is the main orchestration function that runs all build phases in sequence:
 *
 * 1. **Setup**: Read package.json, extract entries, create output directory
 * 2. **TSDoc Lint**: Validate documentation (if enabled)
 * 3. **Bundle**: Run Bun.build() to bundle source files
 * 4. **Declarations**: Generate and bundle TypeScript declarations
 * 5. **Copy Files**: Copy additional assets to output
 * 6. **Transform Files**: Run user-defined post-processing (if provided)
 * 7. **Write package.json**: Transform and write final package.json
 * 8. **Copy to local paths**: Copy artifacts to local paths (npm target, non-CI only)
 *
 * @param options - Builder configuration options
 * @param target - The build target to execute
 * @returns Build result containing success status, outputs, and timing
 *
 * @internal
 */
export async function executeBuild(options: BunLibraryBuilderOptions, target: BuildTarget): Promise<BuildResult> {
	const cwd = process.cwd();
	const outdir = join(cwd, "dist", target);
	const logger = BuildLogger.createEnvLogger(target);
	const timer = BuildLogger.createTimer();

	// Read package.json
	const packageJsonPath = join(cwd, "package.json");
	const packageJsonContent = await readFile(packageJsonPath, "utf-8");
	const packageJson = JSON.parse(packageJsonContent) as PackageJson;

	// Get version
	const version = await FileSystemUtils.packageJsonVersion();

	// Extract entry points
	const extractor = new EntryExtractor({
		exportsAsIndexes: options.exportsAsIndexes,
	});
	const { entries, exportPaths } = extractor.extract(packageJson);

	if (Object.keys(entries).length === 0) {
		logger.error("No entry points found in package.json");
		return {
			success: false,
			target,
			outdir,
			outputs: [],
			duration: timer.elapsed(),
			errors: [new Error("No entry points found")],
		};
	}

	// Log auto-detected entries
	logger.entries("auto-detected entries", entries);

	// Log tsconfig being used
	const tsconfigPath = options.tsconfigPath ?? "tsconfig.json";
	logger.global.info(`Using tsconfig: ${tsconfigPath}`);

	const context: BuildContext = {
		cwd,
		target,
		options,
		outdir,
		entries,
		exportPaths,
		version,
		packageJson,
	};

	// Validate apiModel.localPaths early to fail fast before expensive build operations.
	// Only validates for npm target and non-CI environments where local copying occurs.
	if (target === "npm" && !BuildLogger.isCI()) {
		const unscopedName = FileSystemUtils.getUnscopedPackageName(packageJson.name ?? "package");
		const apiModelConfig = ApiModelConfigResolver.resolve(options.apiModel, unscopedName);

		if (apiModelConfig.localPaths.length > 0) {
			LocalPathValidator.validatePaths(cwd, apiModelConfig.localPaths);
		}
	}

	// Clean output directory
	await rm(outdir, { recursive: true, force: true });
	await mkdir(outdir, { recursive: true });

	// Phase 1: Pre-build (TSDoc lint)
	// Lint is resolved from apiModel.tsdoc.lint (shared tsdoc config)
	const apiModelOption = options.apiModel;
	const apiModelObj = typeof apiModelOption === "object" && apiModelOption !== null ? apiModelOption : {};
	const tsdocConfig = apiModelObj.tsdoc;
	const lintConfig = tsdocConfig?.lint;

	// Lint is enabled if apiModel is not false and lint is not false
	const lintEnabled = apiModelOption !== false && lintConfig !== false;

	if (lintEnabled && lintConfig !== undefined) {
		// Extract shared tsdoc config (without lint) and merge with lint-specific options
		const { lint: _lint, ...sharedTsdoc } = tsdocConfig ?? {};
		const lintOptions = typeof lintConfig === "object" ? lintConfig : {};
		await runTsDocLint(context, {
			...lintOptions,
			tsdoc: Object.keys(sharedTsdoc).length > 0 ? sharedTsdoc : undefined,
		});
	}

	// Phase 2: Bundle with Bun.build()
	const { outputs, success } = await runBunBuild(context);
	if (!success) {
		return {
			success: false,
			target,
			outdir,
			outputs: [],
			duration: timer.elapsed(),
			errors: [new Error("Bun.build() failed")],
		};
	}

	// Track files for package.json files array
	const filesArray = new Set<string>();

	// Add bundle outputs to files array
	for (const output of outputs) {
		const relativePath = relative(outdir, output.path);
		// Skip source maps from files array
		if (!relativePath.endsWith(".map")) {
			filesArray.add(relativePath);
		}
	}

	// Phase 3: Declaration generation
	const tempDtsDir = join(cwd, ".bun-builder", "declarations", target);
	await rm(tempDtsDir, { recursive: true, force: true });
	await mkdir(tempDtsDir, { recursive: true });

	const dtsSuccess = await runTsgoGeneration(context, tempDtsDir);
	if (!dtsSuccess) {
		logger.warn("Declaration generation failed, continuing without .d.ts files");
	} else {
		// Phase 4: Bundle declarations with API Extractor
		const { bundledDtsPaths, apiModelPath, tsconfigPath, tsdocConfigPath, dtsFiles } = await runApiExtractor(
			context,
			tempDtsDir,
			target === "npm" ? options.apiModel : undefined,
		);

		if (bundledDtsPaths) {
			for (const dtsPath of bundledDtsPaths) {
				filesArray.add(relative(outdir, dtsPath));
			}
		}

		// If API Extractor failed and we fell back to copying unbundled declarations
		if (dtsFiles) {
			for (const file of dtsFiles) {
				filesArray.add(file);
			}
		}

		if (apiModelPath) {
			// API model is excluded from npm publish
			filesArray.add(`!${relative(outdir, apiModelPath)}`);
		}

		if (tsconfigPath) {
			// tsconfig.json is excluded from npm publish (used by documentation tools)
			filesArray.add("!tsconfig.json");
		}

		if (tsdocConfigPath) {
			// tsdoc.json is excluded from npm publish (used by documentation tools)
			filesArray.add("!tsdoc.json");
		}

		// Persist tsdoc.json to project root for IDE support
		// Uses the shared tsdoc config from apiModel.tsdoc (which also drives lint)
		// Only persist if lint didn't already persist (to avoid duplicate writes)
		if (target === "npm" && !lintEnabled) {
			const unscopedName = FileSystemUtils.getUnscopedPackageName(packageJson.name ?? "package");
			const apiModelConfig = ApiModelConfigResolver.resolve(options.apiModel, unscopedName);
			const tsdocOptions = apiModelConfig.tsdoc ?? {};

			if (TsDocConfigBuilder.shouldPersist(tsdocOptions.persistConfig)) {
				try {
					const persistPath = TsDocConfigBuilder.getConfigPath(tsdocOptions.persistConfig, cwd);
					await TsDocConfigBuilder.writeConfigFile(tsdocOptions, persistPath);
					logger.success(`Persisted tsdoc configuration to ${persistPath}`);
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					logger.warn(`Failed to persist tsdoc.json: ${errorMessage}`);
				}
			}
		}
	}

	// Phase 5: Copy additional files
	const copyPatterns = options.copyPatterns ?? [];

	// Auto-add public directory if it exists (check both ./public and ./src/public)
	if (existsSync(join(cwd, "src/public"))) {
		copyPatterns.unshift({ from: "./src/public", to: "./" });
	} else if (existsSync(join(cwd, "public"))) {
		copyPatterns.unshift({ from: "./public", to: "./" });
	}

	// Auto-add README and LICENSE
	if (existsSync(join(cwd, "README.md"))) {
		copyPatterns.push({ from: "README.md", noErrorOnMissing: true });
	}
	if (existsSync(join(cwd, "LICENSE"))) {
		copyPatterns.push({ from: "LICENSE", noErrorOnMissing: true });
	}

	const copiedFiles = await copyFiles(context, copyPatterns);
	for (const file of copiedFiles) {
		filesArray.add(file);
	}

	// Phase 6: Transform files callback
	if (options.transformFiles) {
		const outputsMap = new Map<string, Uint8Array | string>();
		for (const output of outputs) {
			const content = await readFile(output.path);
			outputsMap.set(relative(outdir, output.path), content);
		}

		await options.transformFiles({
			outputs: outputsMap,
			filesArray,
			target,
		});
	}

	// Phase 7: Virtual entries
	const virtualEntries = options.virtualEntries ?? {};
	if (Object.keys(virtualEntries).length > 0) {
		const virtualLogger = BuildLogger.createEnvLogger(target);
		const virtualTimer = BuildLogger.createTimer();

		// Group virtual entries by format
		const byFormat = new Map<string, Map<string, string>>();
		for (const [outputName, config] of Object.entries(virtualEntries)) {
			const entryFormat = config.format ?? "esm";
			let formatMap = byFormat.get(entryFormat);
			if (!formatMap) {
				formatMap = new Map();
				byFormat.set(entryFormat, formatMap);
			}
			// Strip extension from output name to get entry name
			const entryName = outputName.replace(/\.(c|m)?js$/, "");
			formatMap.set(entryName, config.source);
		}

		// Build each format group
		for (const [format, entries] of byFormat) {
			const entrypoints = [...entries.values()].map((entry) => (entry.startsWith("./") ? join(cwd, entry) : entry));

			const external: string[] = [];
			if (options.externals) {
				for (const ext of options.externals) {
					if (typeof ext === "string") {
						external.push(ext);
					} else if (ext instanceof RegExp) {
						external.push(ext.source);
					}
				}
			}

			const virtualResult = await Bun.build({
				entrypoints,
				outdir,
				target: options.bunTarget ?? "bun",
				format: format as "esm" | "cjs",
				splitting: false,
				sourcemap: "none",
				minify: false,
				external,
				packages: "external",
				naming: "[dir]/[name].[ext]",
			});

			if (!virtualResult.success) {
				virtualLogger.error(`Virtual entry build failed (${format}):`);
				for (const log of virtualResult.logs) {
					virtualLogger.error(`  ${String(log)}`);
				}
				continue;
			}

			// Rename outputs to match virtual entry names and add to filesArray
			for (const output of virtualResult.outputs) {
				const outputRelative = relative(outdir, output.path);
				const outputBase = outputRelative.replace(/\.(c|m)?js$/, "");

				// Find matching entry name
				for (const [entryName, source] of entries) {
					const normalizedSource = source.replace(/^\.\//, "").replace(/\.tsx?$/, "");
					const variants = [
						normalizedSource,
						normalizedSource.replace(/^src\//, ""),
						normalizedSource.replace(/\/index$/, ""),
						normalizedSource.replace(/^src\//, "").replace(/\/index$/, ""),
					].filter((v) => v.length > 0);

					const isMatch = variants.some((v) => v === outputBase || outputRelative.replace(/\.(c|m)?js$/, "") === v);

					if (isMatch) {
						// Find the original output name for this entry
						const originalOutputName = Object.keys(virtualEntries).find((name) => {
							const stripped = name.replace(/\.(c|m)?js$/, "");
							return stripped === entryName;
						});

						if (originalOutputName && originalOutputName !== outputRelative) {
							const newPath = join(outdir, originalOutputName);
							await mkdir(dirname(newPath), { recursive: true });
							const { rename } = await import("node:fs/promises");
							await rename(output.path, newPath);
							filesArray.add(originalOutputName);
						} else {
							filesArray.add(outputRelative);
						}
						break;
					}
				}
			}
		}

		virtualLogger.info(`Built virtual entries in ${BuildLogger.formatTime(virtualTimer.elapsed())}`);
	}

	// Phase 8: Write package.json
	await writePackageJson(context, filesArray);
	filesArray.add("package.json");

	// Phase 9: Copy API artifacts to local paths (npm target only, skip in CI)
	// This enables documentation workflows where API models need to be available
	// in directories outside the standard build output.
	if (target === "npm" && !BuildLogger.isCI()) {
		const unscopedName = FileSystemUtils.getUnscopedPackageName(packageJson.name ?? "package");
		const apiModelConfig = ApiModelConfigResolver.resolve(options.apiModel, unscopedName);

		if (apiModelConfig.localPaths.length > 0) {
			const copier = new LocalPathCopier(context, {
				apiModelFilename: apiModelConfig.filename,
				tsdocMetadataFilename: apiModelConfig.tsdocMetadataFilename,
			});
			await copier.copyToLocalPaths(apiModelConfig.localPaths);
		}
	}

	// Log files array
	const sortedFiles = Array.from(filesArray).sort();
	logger.fileOp("added to files array", sortedFiles);

	// Print ready message
	logger.ready(`built in ${BuildLogger.formatTime(timer.elapsed())}`);

	// Print file table
	const fileInfo = await BuildLogger.collectFileInfo(outdir, sortedFiles);
	BuildLogger.printFileTable(fileInfo, outdir, `(${target})`);

	return {
		success: true,
		target,
		outdir,
		outputs: outputs.map((o) => o.path),
		duration: timer.elapsed(),
	};
}
