import type { PathLike } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { RsbuildPlugin, RsbuildPluginAPI } from "@rsbuild/core";
import { logger } from "@rsbuild/core";
import type { ESLint as ESLintNamespace, Linter } from "eslint";
import color from "picocolors";
import type { TsDocOptions } from "./dts-plugin.js";
import { TsDocConfigBuilder } from "./dts-plugin.js";
import type { ImportGraphError } from "./utils/import-graph.js";
import { ImportGraph } from "./utils/import-graph.js";

/**
 * Helper interface for handling ESM/CJS module format differences.
 * Some modules export default, others export directly.
 */
interface ESModuleExport<T> {
	default?: T;
}

/**
 * Error behavior for TSDoc lint errors.
 *
 * @remarks
 * - `"warn"`: Log warnings but continue the build
 * - `"error"`: Log errors but continue the build
 * - `"throw"`: Fail the build with an error
 *
 * @public
 */
export type TsDocLintErrorBehavior = "warn" | "error" | "throw";

/**
 * Options for the TSDoc lint plugin.
 *
 * @remarks
 * This plugin validates TSDoc comments in your source files before the build
 * starts using ESLint with `eslint-plugin-tsdoc`. It helps catch documentation
 * errors early in the development cycle.
 *
 * @example
 * Enable with defaults (throws in CI, errors locally):
 * ```typescript
 * import { TsDocLintPlugin } from '@savvy-web/rslib-builder';
 *
 * export default defineConfig({
 *   plugins: [TsDocLintPlugin()],
 * });
 * ```
 *
 * @example
 * Custom configuration:
 * ```typescript
 * import { TsDocLintPlugin } from '@savvy-web/rslib-builder';
 *
 * export default defineConfig({
 *   plugins: [
 *     TsDocLintPlugin({
 *       tsdoc: {
 *         tagDefinitions: [{ tagName: '@error', syntaxKind: 'block' }],
 *       },
 *       onError: 'throw',
 *       persistConfig: true,
 *     }),
 *   ],
 * });
 * ```
 *
 * @public
 */
export interface TsDocLintPluginOptions {
	/**
	 * Whether to enable TSDoc linting.
	 * @defaultValue true
	 */
	enabled?: boolean;

	/**
	 * TSDoc configuration for custom tag definitions.
	 * Uses the same options as the DtsPlugin's apiModel.tsdoc option.
	 *
	 * @remarks
	 * By default, all standard tag groups (core, extended, discretionary) are
	 * enabled. Custom tags defined in `tagDefinitions` are automatically
	 * supported.
	 */
	tsdoc?: TsDocOptions;

	/**
	 * Override automatic file discovery with explicit file paths or glob patterns.
	 *
	 * @remarks
	 * By default, TsDocLintPlugin uses import graph analysis to discover files
	 * from your package's exports. This ensures only public API files are linted.
	 *
	 * Use this option only when you need to lint specific files that aren't
	 * part of the export graph, or to override the automatic discovery.
	 *
	 * When specified as glob patterns, test files and `__test__` directories
	 * are still excluded unless explicitly included.
	 *
	 * @example
	 * ```typescript
	 * // Explicit patterns override automatic discovery
	 * TsDocLintPlugin({
	 *   include: ["src/**\/*.ts", "!**\/*.test.ts"],
	 * })
	 * ```
	 */
	include?: string[];

	/**
	 * How to handle TSDoc lint errors.
	 * - `"warn"`: Log warnings but continue the build
	 * - `"error"`: Log errors but continue the build
	 * - `"throw"`: Fail the build with an error
	 *
	 * @defaultValue `"throw"` in CI environments, `"error"` locally
	 */
	onError?: TsDocLintErrorBehavior;

	/**
	 * Persist tsdoc.json to disk for tool integration (ESLint, IDEs).
	 * - `true`: Write to project root as "tsdoc.json"
	 * - `PathLike`: Write to specified path
	 * - `false`: Clean up after linting
	 *
	 * @defaultValue `true` when not in CI, `false` in CI environments
	 */
	persistConfig?: boolean | PathLike;
}

/**
 * Result of a single lint message from ESLint.
 * @internal
 */
export interface LintMessage {
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
export interface LintResult {
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
export function formatLintResults(results: LintResult, cwd: string): string {
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
		lines.push(color.underline(color.cyan(relative(cwd, filePath))));

		for (const msg of messages) {
			const location = color.dim(`${msg.line}:${msg.column}`);
			const severityColor = msg.severity === 2 ? color.red : color.yellow;
			const severityLabel = msg.severity === 2 ? "error" : "warning";
			const rule = msg.ruleId ? color.dim(`(${msg.ruleId})`) : "";
			lines.push(`  ${location}  ${severityColor(severityLabel)}  ${msg.message} ${rule}`);
		}

		lines.push(""); // Empty line between files
	}

	// Summary line
	const errorText = results.errorCount === 1 ? "error" : "errors";
	const warningText = results.warningCount === 1 ? "warning" : "warnings";
	const summary =
		results.errorCount > 0
			? color.red(`${results.errorCount} ${errorText}`)
			: color.yellow(`${results.warningCount} ${warningText}`);
	lines.push(summary);

	return lines.join("\n");
}

/**
 * Result of file discovery for TSDoc linting.
 * @internal
 */
interface FileDiscoveryResult {
	/** Files to lint (absolute paths or glob patterns depending on isGlobPattern) */
	files: string[];
	/** Errors encountered during discovery (non-fatal) */
	errors: ImportGraphError[];
	/** Whether files contains glob patterns (true) or absolute paths (false) */
	isGlobPattern: boolean;
}

/**
 * Discovers files to lint using import graph analysis or explicit patterns.
 *
 * @remarks
 * When no explicit `include` patterns are provided, this function uses
 * {@link ImportGraph} to trace imports from package.json exports. This ensures
 * only public API files are linted, avoiding internal implementation details.
 *
 * @param options - Plugin options containing optional include patterns
 * @param cwd - The project root directory
 * @returns Discovery result with files to lint and any errors encountered
 *
 * @internal
 */
export function discoverFilesToLint(options: TsDocLintPluginOptions, cwd: string): FileDiscoveryResult {
	// If user provided explicit patterns, use those
	if (options.include && options.include.length > 0) {
		return {
			files: options.include,
			errors: [],
			isGlobPattern: true,
		};
	}

	// Default: discover files from package.json exports using import graph
	const graph = new ImportGraph({ rootDir: cwd });
	const packageJsonPath = join(cwd, "package.json");
	const result = graph.traceFromPackageExports(packageJsonPath);

	return {
		files: result.files,
		errors: result.errors,
		isGlobPattern: false,
	};
}

/**
 * Result of running TSDoc lint via ESLint.
 * @internal
 */
interface TsDocLintRunResult {
	/** The lint results containing errors, warnings, and messages */
	results: LintResult;
	/** Path to the persisted tsdoc.json file (undefined if not persisted) */
	tsdocConfigPath?: string;
	/** Errors from file discovery (undefined if no errors) */
	discoveryErrors?: ImportGraphError[];
}

/**
 * Runs TSDoc lint using ESLint programmatically.
 *
 * @remarks
 * This function dynamically imports ESLint and its plugins (optional peer dependencies),
 * generates a tsdoc.json configuration file, discovers files to lint, and runs
 * ESLint with the `eslint-plugin-tsdoc` plugin.
 *
 * @param options - Plugin options for configuring TSDoc linting
 * @param cwd - The project root directory
 * @returns Promise resolving to lint results and configuration paths
 *
 * @throws Error if required ESLint packages are not installed
 *
 * @internal
 */
export async function runTsDocLint(options: TsDocLintPluginOptions, cwd: string): Promise<TsDocLintRunResult> {
	// Generate tsdoc.json config file
	const tsdocOptions = options.tsdoc ?? {};
	const persistConfig = options.persistConfig;
	const shouldPersist = TsDocConfigBuilder.shouldPersist(persistConfig);
	const tsdocConfigOutputPath = TsDocConfigBuilder.getConfigPath(persistConfig, cwd);

	const tsdocConfigPath = await TsDocConfigBuilder.writeConfigFile(tsdocOptions, dirname(tsdocConfigOutputPath));

	// Dynamic import ESLint and plugins (optional peer dependencies)
	// Import each package separately to detect which specific ones are missing
	let ESLint: typeof import("eslint").ESLint | undefined;
	let tsParserModule: unknown;
	let tsdocPluginModule: unknown;

	const missingPackages: string[] = [];

	try {
		const eslintModule = await import("eslint");
		ESLint = eslintModule.ESLint;
	} catch {
		missingPackages.push("eslint");
	}

	try {
		tsParserModule = await import("@typescript-eslint/parser");
	} catch {
		missingPackages.push("@typescript-eslint/parser");
	}

	try {
		tsdocPluginModule = await import("eslint-plugin-tsdoc");
	} catch {
		missingPackages.push("eslint-plugin-tsdoc");
	}

	if (missingPackages.length > 0 || !ESLint) {
		throw new Error(
			`TsDocLintPlugin requires: ${missingPackages.join(", ")}\n` +
				`Install with: pnpm add -D ${missingPackages.join(" ")}`,
		);
	}

	// Handle both ESM and CJS module formats
	const tsParser = (tsParserModule as ESModuleExport<Linter.Parser>).default ?? (tsParserModule as Linter.Parser);
	const tsdocPlugin =
		(tsdocPluginModule as ESModuleExport<ESLintNamespace.Plugin>).default ??
		(tsdocPluginModule as ESLintNamespace.Plugin);

	// Discover files to lint
	const discovery = discoverFilesToLint(options, cwd);

	// If no files discovered, return early with empty results
	if (discovery.files.length === 0) {
		return {
			results: { errorCount: 0, warningCount: 0, messages: [] },
			tsdocConfigPath: shouldPersist ? tsdocConfigPath : undefined,
			discoveryErrors: discovery.errors,
		};
	}

	// Create ESLint instance with inline config
	let eslintConfig: Linter.Config[];
	let filesToLint: string[];

	if (discovery.isGlobPattern) {
		// User provided glob patterns
		const includePatterns = discovery.files;
		filesToLint = includePatterns.filter((p) => !p.startsWith("!"));

		eslintConfig = [
			{
				ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**"],
			},
			{
				files: filesToLint,
				ignores: includePatterns.filter((p) => p.startsWith("!")).map((p) => p.slice(1)),
				languageOptions: {
					parser: tsParser as Linter.Parser,
				},
				plugins: { tsdoc: tsdocPlugin as ESLintNamespace.Plugin },
				rules: {
					"tsdoc/syntax": "error",
				},
			},
		];
	} else {
		// ImportGraph discovered absolute file paths
		filesToLint = discovery.files;

		eslintConfig = [
			{
				ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**"],
			},
			{
				files: ["**/*.ts", "**/*.tsx"],
				languageOptions: {
					parser: tsParser as Linter.Parser,
				},
				plugins: { tsdoc: tsdocPlugin as ESLintNamespace.Plugin },
				rules: {
					"tsdoc/syntax": "error",
				},
			},
		];
	}

	const eslint = new ESLint({
		cwd,
		overrideConfigFile: true,
		overrideConfig: eslintConfig,
	});

	// Run ESLint on source files
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

	return {
		results: { errorCount, warningCount, messages },
		tsdocConfigPath: shouldPersist ? tsdocConfigPath : undefined,
		discoveryErrors: discovery.errors.length > 0 ? discovery.errors : undefined,
	};
}

/**
 * Cleans up the tsdoc.json config file.
 *
 * @param configPath - Path to the config file
 *
 * @internal
 */
/**
 * Cleans up the tsdoc.json config file.
 *
 * @param configPath - Path to the config file to delete
 *
 * @internal
 */
export async function cleanupTsDocConfig(configPath: string | undefined): Promise<void> {
	if (!configPath) return;

	try {
		const { unlink } = await import("node:fs/promises");
		await unlink(configPath);
	} catch {
		// Ignore cleanup errors
	}
}

/**
 * Creates a plugin to validate TSDoc comments before build using ESLint with eslint-plugin-tsdoc.
 *
 * @remarks
 * This plugin runs TSDoc validation during the `onBeforeBuild` hook, ensuring that
 * documentation errors are caught before compilation begins. It generates a virtual
 * `tsdoc.json` configuration file that can be persisted for IDE and tool integration.
 *
 * ## Features
 *
 * - Programmatic ESLint execution with `eslint-plugin-tsdoc`
 * - Configurable error handling (warn, error, throw)
 * - Automatic CI detection for stricter defaults
 * - Optional tsdoc.json persistence for tool integration
 * - Automatic file discovery via import graph analysis
 * - Customizable file patterns when needed
 *
 * ## Error Handling
 *
 * | Environment | Default Behavior | On Lint Errors |
 * |-------------|------------------|----------------|
 * | Local       | `"error"`        | Log and continue |
 * | CI          | `"throw"`        | Fail the build |
 *
 * ## Required Dependencies
 *
 * This plugin requires the following optional peer dependencies:
 * - `eslint`
 * - `@typescript-eslint/parser`
 * - `eslint-plugin-tsdoc`
 *
 * Install with: `pnpm add -D eslint @typescript-eslint/parser eslint-plugin-tsdoc`
 *
 * @param options - Plugin configuration options
 * @returns An Rsbuild plugin that validates TSDoc comments before the build
 *
 * @example
 * ```typescript
 * import { TsDocLintPlugin } from '@savvy-web/rslib-builder';
 *
 * export default defineConfig({
 *   plugins: [
 *     TsDocLintPlugin({
 *       onError: 'throw',
 *       persistConfig: true,
 *     }),
 *   ],
 * });
 * ```
 *
 * @public
 */
/* v8 ignore start -- Integration plugin factory called by Rsbuild */
export const TsDocLintPlugin = (options: TsDocLintPluginOptions = {}): RsbuildPlugin => {
	const { enabled = true } = options;

	// State for cleanup
	let tempTsDocConfigPath: string | undefined;

	return {
		name: "tsdoc-lint-plugin",
		setup(api: RsbuildPluginAPI): void {
			if (!enabled) {
				return;
			}

			// Run TSDoc linting before the build starts
			api.onBeforeBuild(async () => {
				const cwd = api.context.rootPath;
				const isCI = TsDocConfigBuilder.isCI();

				// Determine error behavior
				const onError = options.onError ?? (isCI ? "throw" : "error");

				logger.info(`${color.dim("[tsdoc-lint]")} Validating TSDoc comments...`);

				try {
					const { results, tsdocConfigPath, discoveryErrors } = await runTsDocLint(options, cwd);

					// Log any discovery warnings
					if (discoveryErrors && discoveryErrors.length > 0) {
						for (const error of discoveryErrors) {
							logger.warn(`${color.dim("[tsdoc-lint]")} ${error.message}`);
						}
					}

					// Store for potential cleanup later
					if (!TsDocConfigBuilder.shouldPersist(options.persistConfig)) {
						tempTsDocConfigPath = tsdocConfigPath;
					}

					if (results.errorCount === 0 && results.warningCount === 0) {
						logger.info(`${color.dim("[tsdoc-lint]")} ${color.green("All TSDoc comments are valid")}`);
						return;
					}

					// Format and log results
					const formatted = formatLintResults(results, cwd);

					if (results.errorCount > 0) {
						if (onError === "throw") {
							throw new Error(`TSDoc validation failed:\n${formatted}`);
						} else if (onError === "error") {
							logger.error(`${color.dim("[tsdoc-lint]")} TSDoc validation errors:\n${formatted}`);
						} else {
							logger.warn(`${color.dim("[tsdoc-lint]")} TSDoc validation warnings:\n${formatted}`);
						}
					} else if (results.warningCount > 0) {
						logger.warn(`${color.dim("[tsdoc-lint]")} TSDoc validation warnings:\n${formatted}`);
					}
				} catch (error) {
					// Clean up temp config on error
					await cleanupTsDocConfig(tempTsDocConfigPath);
					throw error;
				}
			});

			// Clean up temp tsdoc.json after build completes
			api.onCloseBuild(async () => {
				await cleanupTsDocConfig(tempTsDocConfigPath);
			});
		},
	};
};
/* v8 ignore stop */
