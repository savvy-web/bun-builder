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
 *
 * @packageDocumentation
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import type { BuildArtifact } from "bun";
import { EntryExtractor } from "../plugins/utils/entry-extractor.js";
import {
	getApiExtractorPath,
	getTsgoBinPath,
	getUnscopedPackageName,
	packageJsonVersion,
} from "../plugins/utils/file-utils.js";
import {
	collectFileInfo,
	createEnvLogger,
	createLogger,
	createTimer,
	formatTime,
	isCI,
	printFileTable,
} from "../plugins/utils/logger.js";
import { buildPackageJson } from "../plugins/utils/package-json-transformer.js";
import type {
	ApiModelOptions,
	BuildResult,
	BuildTarget,
	BunLibraryBuilderOptions,
	CopyPatternConfig,
	TsDocLintOptions,
} from "../types/builder-types.js";
import type { PackageJson } from "../types/package-json.js";

/**
 * Context passed to build lifecycle hooks.
 *
 * @remarks
 * This context is created at the start of each target build and passed through
 * all build phases. It contains all the information needed to execute each phase.
 *
 * @public
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
	 * Package version from package.json.
	 */
	version: string;

	/**
	 * Original package.json content.
	 */
	packageJson: PackageJson;
}

/**
 * Runs TSDoc lint validation before the build.
 *
 * @remarks
 * Uses ESLint with the `eslint-plugin-tsdoc` plugin to validate documentation
 * comments in entry point files. Errors are handled according to the `onError`
 * option, defaulting to `"throw"` in CI and `"error"` locally.
 *
 * Files to lint are automatically discovered from the entry points.
 *
 * @param context - The build context
 * @param options - TSDoc lint configuration options
 * @throws When `onError` is `"throw"` and validation errors are found
 *
 * @public
 */
export async function runTsDocLint(context: BuildContext, options: TsDocLintOptions): Promise<void> {
	const logger = createLogger("tsdoc-lint");

	if (options.enabled === false) {
		return;
	}

	logger.info("Validating TSDoc comments...");

	// Dynamic import ESLint and plugins
	const eslintModule = await import("eslint");
	const tsParserModule = await import("@typescript-eslint/parser");
	const tsdocPluginModule = await import("eslint-plugin-tsdoc");

	const { ESLint } = eslintModule;
	const tsParser = (tsParserModule as { default?: unknown }).default ?? tsParserModule;
	const tsdocPlugin = (tsdocPluginModule as { default?: unknown }).default ?? tsdocPluginModule;

	// Discover files to lint from entry points
	const files = Object.values(context.entries).map((entry) =>
		entry.startsWith("./") ? join(context.cwd, entry) : entry,
	);

	if (files.length === 0) {
		logger.info("No files to lint");
		return;
	}

	const eslint = new ESLint({
		cwd: context.cwd,
		overrideConfigFile: true,
		overrideConfig: [
			{
				ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**"],
			},
			{
				files: ["**/*.ts", "**/*.tsx"],
				languageOptions: {
					parser: tsParser as Parameters<typeof ESLint.prototype.lintFiles>[0],
				},
				plugins: { tsdoc: tsdocPlugin as Record<string, unknown> },
				rules: {
					"tsdoc/syntax": "error",
				},
			},
		],
	});

	const results = await eslint.lintFiles(files);

	let errorCount = 0;
	let warningCount = 0;

	for (const result of results) {
		for (const msg of result.messages) {
			if (msg.severity === 2) errorCount++;
			else warningCount++;
		}
	}

	if (errorCount === 0 && warningCount === 0) {
		logger.success("All TSDoc comments are valid");
		return;
	}

	const onError = options.onError ?? (isCI() ? "throw" : "error");

	if (errorCount > 0) {
		const message = `TSDoc validation found ${errorCount} error(s)`;
		if (onError === "throw") {
			throw new Error(message);
		} else if (onError === "error") {
			logger.error(message);
		} else {
			logger.warn(message);
		}
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
 * @public
 */
export async function runBunBuild(context: BuildContext): Promise<{ outputs: BuildArtifact[]; success: boolean }> {
	const logger = createEnvLogger(context.target);
	const timer = createTimer();

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
			packages: "bundle",
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
	// Bun.build() names files based on source paths, but we need them
	// to match entry names for correct package.json paths
	const renamedOutputs: BuildArtifact[] = [];
	const sourceToEntryName = new Map<string, string>();

	for (const [name, source] of Object.entries(context.entries)) {
		// Normalize source path to match what Bun uses
		const normalizedSource = source.replace(/^\.\//, "").replace(/\.tsx?$/, "");
		sourceToEntryName.set(normalizedSource, name);
	}

	for (const output of result.outputs) {
		const relativePath = relative(context.outdir, output.path);
		const relativeWithoutExt = relativePath.replace(/\.(js|map)$/, "");

		// Check for various path prefixes that Bun might use
		let entryName: string | undefined;
		let bestMatchLength = 0;

		for (const [source, name] of sourceToEntryName) {
			// Try different normalizations
			const variants = [
				source, // e.g., "src/cli/index"
				source.replace(/^src\//, ""), // e.g., "cli/index"
				source.replace(/\/index$/, ""), // e.g., "src/cli"
				source
					.replace(/^src\//, "")
					.replace(/\/index$/, ""), // e.g., "cli"
			].filter((v) => v.length > 0); // Filter out empty strings

			for (const variant of variants) {
				// Prefer exact matches or the longest matching suffix
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

	logger.info(`Bundled ${renamedOutputs.length} file(s) in ${formatTime(timer.elapsed())}`);

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
 * @public
 */
export async function runTsgoGeneration(context: BuildContext, tempDtsDir: string): Promise<boolean> {
	const logger = createEnvLogger(context.target);
	const timer = createTimer();

	logger.info("Generating declaration files...");

	const tsgoBinPath = getTsgoBinPath();

	// Delete tsbuildinfo files to force rebuild (needed for composite projects)
	// Without this, tsgo may skip generation if it thinks nothing changed
	const { glob: globAsync } = await import("glob");
	const tsbuildInfoGlob = join(context.cwd, "dist", ".tsbuildinfo*");
	const tsbuildFiles = await globAsync(tsbuildInfoGlob);
	for (const file of tsbuildFiles) {
		await rm(file, { force: true }).catch(() => {});
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
				logger.info(`Generated declarations in ${formatTime(timer.elapsed())}`);
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
	const logger = createEnvLogger(context.target);
	const { glob } = await import("glob");

	// Find all .d.ts files in the temp directory
	const dtsFiles = await glob("**/*.d.ts", { cwd: tempDtsDir });
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
 * Bundles declarations with API Extractor.
 *
 * @remarks
 * Uses the API Extractor programmatic API to bundle all declaration files
 * into a single `index.d.ts`. This produces cleaner output for consumers
 * and can also generate an API model JSON file for documentation tools.
 *
 * If API Extractor is not installed or fails, falls back to copying
 * unbundled declarations via {@link copyUnbundledDeclarations}.
 *
 * @param context - The build context
 * @param tempDtsDir - Directory containing generated declaration files
 * @param apiModel - API model generation options (only for npm target)
 * @returns Object containing paths to bundled declaration and API model,
 *          or array of unbundled declaration files if bundling failed
 *
 * @public
 */
export async function runApiExtractor(
	context: BuildContext,
	tempDtsDir: string,
	apiModel?: ApiModelOptions | boolean,
): Promise<{ bundledDtsPath?: string; apiModelPath?: string; dtsFiles?: string[] }> {
	const logger = createEnvLogger(context.target);
	const timer = createTimer();

	// Validate API Extractor is installed
	try {
		getApiExtractorPath();
	} catch {
		logger.warn("API Extractor not found, copying unbundled declarations");
		const { dtsFiles } = await copyUnbundledDeclarations(context, tempDtsDir);
		return { dtsFiles };
	}

	// Find the main entry point declaration
	const mainEntryPath = Object.values(context.entries)[0];
	if (!mainEntryPath) {
		logger.warn("No entry points found for API Extractor");
		const { dtsFiles } = await copyUnbundledDeclarations(context, tempDtsDir);
		return { dtsFiles };
	}

	// Convert entry source path to declaration path
	const normalizedPath = mainEntryPath.replace(/^\.\//, "").replace(/\.tsx?$/, ".d.ts");
	let tempDtsPath = join(tempDtsDir, normalizedPath);

	// If source was in src/, check both with and without src/ prefix
	if (!existsSync(tempDtsPath) && normalizedPath.startsWith("src/")) {
		const withoutSrc = normalizedPath.replace(/^src\//, "");
		const altPath = join(tempDtsDir, withoutSrc);
		if (existsSync(altPath)) {
			tempDtsPath = altPath;
		}
	}

	if (!existsSync(tempDtsPath)) {
		logger.error(`Declaration file not found: ${tempDtsPath}`);
		const { dtsFiles } = await copyUnbundledDeclarations(context, tempDtsDir);
		return { dtsFiles };
	}

	// Output path for bundled .d.ts
	const bundledDtsPath = join(context.outdir, "index.d.ts");

	// API model configuration
	const apiModelEnabled = apiModel === true || (typeof apiModel === "object" && apiModel.enabled !== false);

	const apiModelFilename =
		typeof apiModel === "object" && apiModel.filename
			? apiModel.filename
			: `${getUnscopedPackageName(context.packageJson.name ?? "package")}.api.json`;

	const apiModelPath = apiModelEnabled ? join(context.outdir, apiModelFilename) : undefined;

	// Ensure output directory exists
	await mkdir(dirname(bundledDtsPath), { recursive: true });

	try {
		// Import API Extractor dynamically
		const { Extractor, ExtractorConfig } = await import("@microsoft/api-extractor");

		// Prepare the extractor configuration
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
				docModel: apiModelEnabled
					? {
							enabled: true,
							apiJsonFilePath: apiModelPath,
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

		// Run API Extractor
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
			},
		});

		if (!extractorResult.succeeded) {
			logger.warn("API Extractor failed, copying unbundled declarations");
			const { dtsFiles } = await copyUnbundledDeclarations(context, tempDtsDir);
			return { dtsFiles };
		}

		logger.info(`Emitted 1 bundled declaration file in ${formatTime(timer.elapsed())}`);

		if (apiModelPath) {
			logger.success(`Emitted API model: ${basename(apiModelPath)} (excluded from npm publish)`);
		}

		return { bundledDtsPath, apiModelPath };
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
 * @public
 */
export async function writePackageJson(context: BuildContext, filesArray: Set<string>): Promise<void> {
	const isProduction = context.target === "npm";

	// Build the user transform function
	const userTransform = context.options.transform;
	const transformFn = userTransform
		? (pkg: PackageJson): PackageJson => userTransform({ target: context.target, pkg })
		: undefined;

	const transformed = await buildPackageJson(
		context.packageJson,
		isProduction,
		true, // processTSExports
		true, // bundle mode
		transformFn,
	);

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
 * @public
 */
export async function copyFiles(context: BuildContext, patterns: (string | CopyPatternConfig)[]): Promise<string[]> {
	const logger = createEnvLogger(context.target);
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
			// Copy directory recursively
			const { glob } = await import("glob");
			const files = await glob("**/*", { cwd: fromPath, nodir: true });

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
 *
 * @param options - Builder configuration options
 * @param target - The build target to execute
 * @returns Build result containing success status, outputs, and timing
 *
 * @public
 */
export async function executeBuild(options: BunLibraryBuilderOptions, target: BuildTarget): Promise<BuildResult> {
	const cwd = process.cwd();
	const outdir = join(cwd, "dist", target);
	const logger = createEnvLogger(target);
	const timer = createTimer();

	// Read package.json
	const packageJsonPath = join(cwd, "package.json");
	const packageJsonContent = await readFile(packageJsonPath, "utf-8");
	const packageJson = JSON.parse(packageJsonContent) as PackageJson;

	// Get version
	const version = await packageJsonVersion();

	// Extract entry points
	const extractor = new EntryExtractor({
		exportsAsIndexes: options.exportsAsIndexes,
	});
	const { entries } = extractor.extract(packageJson);

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
		version,
		packageJson,
	};

	// Clean output directory
	await rm(outdir, { recursive: true, force: true });
	await mkdir(outdir, { recursive: true });

	// Phase 1: Pre-build (TSDoc lint)
	if (options.tsdocLint) {
		const lintOptions = options.tsdocLint === true ? {} : options.tsdocLint;
		await runTsDocLint(context, lintOptions);
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
		const { bundledDtsPath, apiModelPath, dtsFiles } = await runApiExtractor(
			context,
			tempDtsDir,
			target === "npm" ? options.apiModel : undefined,
		);

		if (bundledDtsPath) {
			filesArray.add("index.d.ts");
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

	// Phase 7: Write package.json
	await writePackageJson(context, filesArray);
	filesArray.add("package.json");

	// Log files array
	const sortedFiles = Array.from(filesArray).sort();
	logger.fileOp("added to files array", sortedFiles);

	// Print ready message
	logger.ready(`built in ${formatTime(timer.elapsed())}`);

	// Print file table
	const fileInfo = await collectFileInfo(outdir, sortedFiles);
	printFileTable(fileInfo, outdir, `(${target})`);

	return {
		success: true,
		target,
		outdir,
		outputs: outputs.map((o) => o.path),
		duration: timer.elapsed(),
	};
}
