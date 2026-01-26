import { spawn } from "node:child_process";
import type { PathLike } from "node:fs";
import { constants, existsSync } from "node:fs";
import { access, copyFile, mkdir, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative } from "node:path";
import { StandardTags, Standardization, TSDocTagSyntaxKind } from "@microsoft/tsdoc";
import type { RsbuildPlugin, RsbuildPluginAPI } from "@rsbuild/core";
import { logger } from "@rsbuild/core";
import deepEqual from "deep-equal";
import color from "picocolors";
import type { PackageJson } from "type-fest";
import type { Diagnostic, ParsedCommandLine } from "typescript";
import {
	createCompilerHost,
	findConfigFile,
	formatDiagnostic,
	parseJsonConfigFileContent,
	readConfigFile,
	sys,
} from "typescript";
import { getWorkspaceRoot } from "workspace-tools";
import { TSConfigs } from "../../tsconfig/index.js";
import { createEnvLogger } from "./utils/build-logger.js";
import { getApiExtractorPath } from "./utils/file-utils.js";

/**
 * TSDoc tag definition for custom documentation tags.
 * @public
 */
export interface TsDocTagDefinition {
	/** The tag name including the at-sign prefix (e.g., `\@error`, `\@category`) */
	tagName: string;
	/** How the tag is parsed: "block" | "inline" | "modifier" */
	syntaxKind: "block" | "inline" | "modifier";
	/** Whether the tag can appear multiple times on a declaration */
	allowMultiple?: boolean;
}

/**
 * TSDoc standardization groups for predefined tag sets.
 *
 * @remarks
 * These groups correspond to the TSDoc specification's standardization levels
 * as defined in `\@microsoft/tsdoc`. Each group contains a set of related tags:
 *
 * - `"core"`: Essential tags for basic documentation
 *   (`\@param`, `\@returns`, `\@remarks`, `\@deprecated`, `\@privateRemarks`, etc.)
 *
 * - `"extended"`: Additional tags for richer documentation
 *   (`\@example`, `\@defaultValue`, `\@see`, `\@throws`, `\@typeParam`, etc.)
 *
 * - `"discretionary"`: Release stage and visibility modifiers
 *   (`\@alpha`, `\@beta`, `\@public`, `\@internal`, `\@experimental`)
 *
 * @example
 * ```typescript
 * import type { TsDocTagGroup } from '@savvy-web/rslib-builder';
 *
 * const groups: TsDocTagGroup[] = ['core', 'extended'];
 * ```
 *
 * @public
 */
export type TsDocTagGroup = "core" | "extended" | "discretionary";

/**
 * TSDoc configuration options for API Extractor.
 * @remarks
 * Provides ergonomic defaults - standard tags are auto-enabled via `groups`,
 * custom tags are auto-supported, and `supportForTags` is only needed to
 * disable specific tags.
 *
 * **Config optimization:** When all groups are enabled (default), the generated
 * `tsdoc.json` uses `noStandardTags: false` to let TSDoc automatically load
 * all standard tags, producing a minimal config file. When a subset of groups
 * is specified, `noStandardTags: true` is used and only the enabled groups'
 * tags are explicitly defined.
 *
 * @public
 */
export interface TsDocOptions {
	/**
	 * TSDoc tag groups to enable. Each group includes predefined standard tags
	 * from the official `\@microsoft/tsdoc` package.
	 * - "core": Essential TSDoc tags (\@param, \@returns, \@remarks, \@deprecated, etc.)
	 * - "extended": Additional tags (\@example, \@defaultValue, \@see, \@throws, etc.)
	 * - "discretionary": Release stage tags (\@alpha, \@beta, \@public, \@internal)
	 *
	 * @remarks
	 * When all groups are enabled (the default), the generated config uses
	 * `noStandardTags: false` and TSDoc loads standard tags automatically.
	 * When a subset is specified, `noStandardTags: true` is used and only
	 * the tags from enabled groups are defined.
	 *
	 * @defaultValue ["core", "extended", "discretionary"]
	 */
	groups?: TsDocTagGroup[];

	/**
	 * Custom TSDoc tag definitions beyond the standard groups.
	 * These are automatically added to supportForTags (no need to declare twice).
	 *
	 * @example
	 * ```typescript
	 * import type { TsDocTagDefinition } from '@savvy-web/rslib-builder';
	 *
	 * const tagDefinitions: TsDocTagDefinition[] = [
	 *   { tagName: '@error', syntaxKind: 'inline' },
	 *   { tagName: '@category', syntaxKind: 'block', allowMultiple: false },
	 * ];
	 * ```
	 */
	tagDefinitions?: TsDocTagDefinition[];

	/**
	 * Override support for specific tags. Only needed to DISABLE tags.
	 * Tags from enabled groups and custom tagDefinitions are auto-supported.
	 *
	 * @example
	 * Disable \@beta even though "extended" group is enabled:
	 * ```typescript
	 * const supportForTags: Record<string, boolean> = { '@beta': false };
	 * ```
	 */
	supportForTags?: Record<string, boolean>;

	/**
	 * Persist tsdoc.json to disk for tool integration (ESLint, IDEs).
	 * - `true`: Write to project root as "tsdoc.json"
	 * - `PathLike`: Write to specified path
	 * - `false`: Clean up after API Extractor
	 *
	 * @defaultValue `true` when `CI` and `GITHUB_ACTIONS` env vars are not "true",
	 *               `false` otherwise (CI environments)
	 */
	persistConfig?: boolean | PathLike;

	/**
	 * How to handle TSDoc validation warnings from API Extractor.
	 * - `"log"`: Show warnings in the console but continue the build
	 * - `"fail"`: Show warnings and fail the build if any are found
	 * - `"none"`: Suppress TSDoc warnings entirely
	 *
	 * @remarks
	 * TSDoc warnings include unknown tags, malformed syntax, and other
	 * documentation issues detected by API Extractor during processing.
	 *
	 * @defaultValue `"fail"` in CI environments (`CI` or `GITHUB_ACTIONS` env vars),
	 *               `"log"` otherwise
	 */
	warnings?: "log" | "fail" | "none";
}

/**
 * Options for tsdoc-metadata.json generation.
 * @public
 */
export interface TsDocMetadataOptions {
	/**
	 * Whether to generate tsdoc-metadata.json.
	 * @defaultValue true (when apiModel is enabled)
	 */
	enabled?: boolean;

	/**
	 * Custom filename for the TSDoc metadata file.
	 * @defaultValue "tsdoc-metadata.json"
	 */
	filename?: string;
}

/**
 * Builder for TSDoc configuration files used by API Extractor.
 *
 * @remarks
 * This class provides utilities for generating `tsdoc.json` configuration files
 * that control TSDoc tag support during API documentation generation.
 *
 * ## Features
 *
 * - Expands tag groups into individual tag definitions
 * - Generates properly formatted tsdoc.json files
 * - Handles config persistence based on environment (CI vs local)
 * - Supports custom tag definitions
 *
 * ## Tag Groups
 *
 * The builder supports three standardization groups from `\@microsoft/tsdoc`:
 * - `core`: Essential tags (`\@param`, `\@returns`, `\@remarks`, etc.)
 * - `extended`: Additional tags (`\@example`, `\@defaultValue`, `\@see`, etc.)
 * - `discretionary`: Release tags (`\@alpha`, `\@beta`, `\@public`, `\@internal`)
 *
 * @example
 * Build tag configuration from options:
 * ```typescript
 * import { TsDocConfigBuilder } from '@savvy-web/rslib-builder';
 *
 * const config = TsDocConfigBuilder.build({
 *   groups: ['core', 'extended'],
 *   tagDefinitions: [
 *     { tagName: '@error', syntaxKind: 'inline' },
 *   ],
 * });
 * ```
 *
 * @example
 * Write a tsdoc.json file:
 * ```typescript
 * import { TsDocConfigBuilder } from '@savvy-web/rslib-builder';
 *
 * const configPath = await TsDocConfigBuilder.writeConfigFile(
 *   { groups: ['core', 'extended', 'discretionary'] },
 *   process.cwd(),
 * );
 * ```
 *
 * @public
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Intentional class-based API for co-located business logic
export class TsDocConfigBuilder {
	/** All available TSDoc tag groups. */
	static readonly ALL_GROUPS: TsDocTagGroup[] = ["core", "extended", "discretionary"];

	/** Maps group names to TSDoc Standardization enum values. */
	private static readonly GROUP_TO_STANDARDIZATION: Record<TsDocTagGroup, Standardization> = {
		core: Standardization.Core,
		extended: Standardization.Extended,
		discretionary: Standardization.Discretionary,
	};

	/**
	 * Standard TSDoc tag definitions organized by standardization group.
	 * Lazily computed from `\@microsoft/tsdoc` StandardTags.
	 */
	static readonly TAG_GROUPS: Record<TsDocTagGroup, TsDocTagDefinition[]> = {
		get core(): TsDocTagDefinition[] {
			return TsDocConfigBuilder.getTagsForGroup("core");
		},
		get extended(): TsDocTagDefinition[] {
			return TsDocConfigBuilder.getTagsForGroup("extended");
		},
		get discretionary(): TsDocTagDefinition[] {
			return TsDocConfigBuilder.getTagsForGroup("discretionary");
		},
	};

	/**
	 * Detects if running in a CI environment.
	 * @returns true if CI or GITHUB_ACTIONS environment variable is "true"
	 */
	static isCI(): boolean {
		return process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
	}

	/**
	 * Gets standard TSDoc tag definitions for a specific group.
	 * Uses StandardTags from `\@microsoft/tsdoc` package.
	 */
	static getTagsForGroup(group: TsDocTagGroup): TsDocTagDefinition[] {
		const standardization = TsDocConfigBuilder.GROUP_TO_STANDARDIZATION[group];
		return StandardTags.allDefinitions
			.filter((tag) => tag.standardization === standardization)
			.map((tag) => ({
				tagName: tag.tagName,
				syntaxKind: TsDocConfigBuilder.syntaxKindToString(tag.syntaxKind),
				...(tag.allowMultiple ? { allowMultiple: true } : {}),
			}));
	}

	/**
	 * Determines if the TSDoc config should be persisted to disk.
	 * @param persistConfig - The persistConfig option value
	 * @returns true if the config should be persisted
	 */
	static shouldPersist(persistConfig: boolean | PathLike | undefined): boolean {
		if (persistConfig === false) return false;
		if (persistConfig !== undefined) return true;
		// Default: persist unless in CI
		return !TsDocConfigBuilder.isCI();
	}

	/**
	 * Gets the output path for the tsdoc.json file.
	 * @param persistConfig - The persistConfig option value
	 * @param cwd - The current working directory
	 * @returns The absolute path where tsdoc.json should be written
	 */
	static getConfigPath(persistConfig: boolean | PathLike | undefined, cwd: string): string {
		if (typeof persistConfig === "string") {
			return isAbsolute(persistConfig) ? persistConfig : join(cwd, persistConfig);
		}
		if (persistConfig instanceof URL || Buffer.isBuffer(persistConfig)) {
			const pathStr = persistConfig.toString();
			return isAbsolute(pathStr) ? pathStr : join(cwd, pathStr);
		}
		// Default: project root
		return join(cwd, "tsdoc.json");
	}

	/**
	 * Builds the complete TSDoc configuration from options.
	 *
	 * @remarks
	 * When all groups are enabled (default), returns `useStandardTags: true` to signal
	 * that the generated config should use `noStandardTags: false` and let TSDoc
	 * automatically load all standard tags. However, `supportForTags` is still populated
	 * because API Extractor requires explicit support declarations for each tag.
	 *
	 * When a subset of groups is specified, returns `useStandardTags: false` to signal
	 * that we must explicitly define which tags to include via `noStandardTags: true`.
	 */
	static build(options: TsDocOptions = {}): {
		tagDefinitions: TsDocTagDefinition[];
		supportForTags: Record<string, boolean>;
		useStandardTags: boolean;
	} {
		// Default to all groups if not specified
		const groups = options.groups ?? TsDocConfigBuilder.ALL_GROUPS;

		// Check if all groups are enabled (allows TSDoc to load standard tags automatically)
		const allGroupsEnabled = TsDocConfigBuilder.ALL_GROUPS.every((g) => groups.includes(g));

		// Collect tag definitions from enabled groups
		// When all groups enabled: only custom tags in tagDefinitions, but all standard tags in supportForTags
		// When subset: both tagDefinitions and supportForTags contain only enabled group tags
		const tagDefinitions: TsDocTagDefinition[] = [];
		const supportForTags: Record<string, boolean> = {};

		// Always populate supportForTags from enabled groups (API Extractor requires this)
		for (const group of groups) {
			for (const tag of TsDocConfigBuilder.TAG_GROUPS[group]) {
				supportForTags[tag.tagName] = true;
				// Only add to tagDefinitions when subset of groups (noStandardTags: true)
				if (!allGroupsEnabled) {
					tagDefinitions.push(tag);
				}
			}
		}

		// Add custom tag definitions (always needed in both tagDefinitions and supportForTags)
		if (options.tagDefinitions) {
			for (const tag of options.tagDefinitions) {
				tagDefinitions.push(tag);
				supportForTags[tag.tagName] = true;
			}
		}

		// Apply user overrides (to disable specific tags)
		if (options.supportForTags) {
			Object.assign(supportForTags, options.supportForTags);
		}

		return { tagDefinitions, supportForTags, useStandardTags: allGroupsEnabled };
	}

	/**
	 * Generates a tsdoc.json file from options.
	 *
	 * @remarks
	 * When all groups are enabled (default), generates a minimal config with
	 * `noStandardTags: false` so TSDoc automatically loads all standard tags.
	 * Only custom tags need to be defined in this case.
	 *
	 * When a subset of groups is specified, generates a config with
	 * `noStandardTags: true` and explicitly defines only the tags from
	 * the enabled groups.
	 */
	static async writeConfigFile(options: TsDocOptions = {}, outputDir: string): Promise<string> {
		const { tagDefinitions, supportForTags, useStandardTags } = TsDocConfigBuilder.build(options);

		const tsdocConfig: Record<string, unknown> = {
			$schema: "https://developer.microsoft.com/json-schemas/tsdoc/v0/tsdoc.schema.json",
			noStandardTags: !useStandardTags,
			reportUnsupportedHtmlElements: false,
		};

		// Only include tagDefinitions if there are any (custom tags or subset of groups)
		if (tagDefinitions.length > 0) {
			tsdocConfig.tagDefinitions = tagDefinitions;
		}

		// Only include supportForTags if there are any entries
		if (Object.keys(supportForTags).length > 0) {
			tsdocConfig.supportForTags = supportForTags;
		}

		const configPath = join(outputDir, "tsdoc.json");

		// Check if file exists and compare objects to avoid unnecessary writes
		if (existsSync(configPath)) {
			try {
				const existingContent = await readFile(configPath, "utf-8");
				const existingConfig = JSON.parse(existingContent);
				// Deep compare objects - if equal, skip writing
				if (deepEqual(existingConfig, tsdocConfig, { strict: true })) {
					return configPath;
				}
			} catch {
				// If we can't read/parse the existing file, just write the new one
			}
		}

		// Format with tabs and trailing newline
		await writeFile(configPath, `${JSON.stringify(tsdocConfig, null, "\t")}\n`);
		return configPath;
	}

	/** Converts TSDocTagSyntaxKind enum to string format. */
	private static syntaxKindToString(kind: TSDocTagSyntaxKind): "block" | "inline" | "modifier" {
		switch (kind) {
			case TSDocTagSyntaxKind.InlineTag:
				return "inline";
			case TSDocTagSyntaxKind.BlockTag:
				return "block";
			case TSDocTagSyntaxKind.ModifierTag:
				return "modifier";
		}
	}
}

/**
 * Options for API model generation.
 * When enabled, generates an `<unscopedPackageName>.api.json` file using API Extractor.
 *
 * @remarks
 * API models are only generated for the main "index" entry point (the "." export).
 * Additional entry points like "./hooks" or "./utils" do not generate separate API models.
 * This prevents multiple conflicting API models and ensures a single source of truth
 * for package documentation.
 *
 * @public
 */
export interface ApiModelOptions {
	/**
	 * Whether to enable API model generation.
	 * @defaultValue false
	 */
	enabled?: boolean;

	/**
	 * Filename for the generated API model file.
	 * @defaultValue `<unscopedPackageName>.api.json` (e.g., `rslib-builder.api.json`)
	 */
	filename?: string;

	/**
	 * Local paths to copy the API model and package.json to.
	 * Used for local testing with documentation systems.
	 *
	 * @remarks
	 * Each path must be a directory. The parent directory must exist,
	 * but the final directory will be created if it doesn't exist.
	 * Both the API model and the processed package.json will be copied.
	 *
	 * The API model file is emitted to dist but excluded from npm publish
	 * (added as negated pattern `!<filename>` in the `files` array).
	 *
	 * @example
	 * ```typescript
	 * import type { ApiModelOptions } from '@savvy-web/rslib-builder';
	 *
	 * const apiModel: ApiModelOptions = {
	 *   enabled: true,
	 *   localPaths: ['../docs-site/lib/packages/my-package'],
	 * };
	 * ```
	 */
	localPaths?: string[];

	/**
	 * TSDoc configuration for custom tag definitions.
	 * Passed to API Extractor for documentation processing.
	 *
	 * @remarks
	 * By default, all standard tag groups (core, extended, discretionary) are
	 * enabled. Custom tags defined in `tagDefinitions` are automatically
	 * supported. Use `supportForTags` only to disable specific tags.
	 *
	 * @example
	 * ```typescript
	 * import type { ApiModelOptions } from '@savvy-web/rslib-builder';
	 *
	 * const apiModel: ApiModelOptions = {
	 *   enabled: true,
	 *   tsdoc: {
	 *     tagDefinitions: [{ tagName: '@error', syntaxKind: 'inline' }],
	 *   },
	 * };
	 * ```
	 */
	tsdoc?: TsDocOptions;

	/**
	 * Options for tsdoc-metadata.json generation.
	 * @defaultValue true (enabled when apiModel is enabled)
	 */
	tsdocMetadata?: TsDocMetadataOptions | boolean;
}

/**
 * Extracts the unscoped package name from a potentially scoped package name.
 * @param name - The package name (e.g., `@scope/package` or `package`)
 * @returns The unscoped name (e.g., `package`)
 * @internal
 */
export function getUnscopedPackageName(name: string): string {
	return name.startsWith("@") ? (name.split("/")[1] ?? name) : name;
}

/**
 * Options for configuring the DTS plugin.
 * @public
 */
export interface DtsPluginOptions {
	/**
	 * Path to TypeScript configuration file.
	 * If not specified, uses the tsconfigPath from Rsbuild config or searches for tsconfig.json.
	 */
	tsconfigPath?: string;

	/**
	 * Custom output directory for declaration files relative to dist root.
	 * If not specified, uses the declarationDir from tsconfig.json or falls back to dist root.
	 */
	distPath?: string;

	/**
	 * Whether to abort the build on TypeScript errors.
	 * @defaultValue true
	 */
	abortOnError?: boolean;

	/**
	 * Custom file extension for declaration files.
	 * @defaultValue ".d.ts"
	 */
	dtsExtension?: string;

	/**
	 * Whether to bundle declaration files using API Extractor.
	 * When true, generates a single .d.ts file per entry point.
	 * @defaultValue false
	 */
	bundle?: boolean;

	/**
	 * Packages whose types should be bundled (inlined) into the output .d.ts files.
	 * Only applies when bundle is true.
	 * Supports glob patterns (e.g., '\@commitlint/*', 'type-fest')
	 * @defaultValue []
	 */
	bundledPackages?: string[];

	/**
	 * Banner text to add at the top of bundled declaration files.
	 * Only applies when bundle is true.
	 */
	banner?: string;

	/**
	 * Footer text to add at the bottom of bundled declaration files.
	 * Only applies when bundle is true.
	 */
	footer?: string;

	/**
	 * Build target (dev, npm).
	 * Used to generate the correct temp tsconfig when tsconfigPath is not provided.
	 */
	buildTarget?: "dev" | "npm";

	/**
	 * Options for API model generation.
	 * When enabled, generates an `<unscopedPackageName>.api.json` file in the dist directory.
	 * Only applies when bundle is true.
	 *
	 * The API model is excluded from npm publish (not added to `files` array).
	 */
	apiModel?: ApiModelOptions | boolean;
}

/**
 * Gets the path to the tsgo (TypeScript native compiler) executable.
 * Uses workspace-tools to find the workspace root and searches for tsgo binary.
 * Supports npm, pnpm, yarn, rush, and lerna workspaces.
 * @returns The absolute path to the tsgo binary
 * @internal
 */
export function getTsgoBinPath(): string {
	const cwd = process.cwd();

	// First, try the current package's node_modules
	const localTsgoBin = join(cwd, "node_modules", ".bin", "tsgo");
	if (existsSync(localTsgoBin)) {
		return localTsgoBin;
	}

	// If not found locally, use workspace-tools to find the workspace root
	// This handles pnpm, npm, yarn, rush, and lerna workspaces
	const workspaceRoot = getWorkspaceRoot(cwd);
	/* v8 ignore start -- Workspace fallback difficult to test without mocking workspace-tools */
	if (workspaceRoot) {
		const workspaceTsgoBin = join(workspaceRoot, "node_modules", ".bin", "tsgo");
		if (existsSync(workspaceTsgoBin)) {
			return workspaceTsgoBin;
		}
	}
	/* v8 ignore stop */

	// Fallback to current directory (will error with a clear message if not found)
	return localTsgoBin;
}

/**
 * Generates command-line arguments for tsgo.
 *
 * @internal
 */
export function generateTsgoArgs(options: {
	configPath: string;
	declarationDir: string;
	rootDir?: string;
	tsBuildInfoFile?: string;
}): string[] {
	const { configPath, declarationDir, rootDir, tsBuildInfoFile } = options;

	const args = [
		"--project",
		configPath,
		"--declaration",
		"--emitDeclarationOnly",
		"--declarationMap",
		"--declarationDir",
		declarationDir,
	];

	if (rootDir) {
		args.push("--rootDir", rootDir);
	}

	if (tsBuildInfoFile) {
		args.push("--tsBuildInfoFile", tsBuildInfoFile);
	}

	return args;
}

/**
 * Recursively collects all .d.ts and .d.ts.map files from a directory.
 *
 * @internal
 */
export async function collectDtsFiles(
	dir: string,
	baseDir: string = dir,
): Promise<Array<{ path: string; relativePath: string }>> {
	const files: Array<{ path: string; relativePath: string }> = [];

	async function walk(currentDir: string): Promise<void> {
		const entries = await readdir(currentDir, { withFileTypes: true });

		for (const entry of entries) {
			const fullPath = join(currentDir, entry.name);

			if (entry.isDirectory()) {
				await walk(fullPath);
			} else if (entry.name.endsWith(".d.ts") || entry.name.endsWith(".d.ts.map")) {
				const relativePath = relative(baseDir, fullPath);
				files.push({ path: fullPath, relativePath });
			}
		}
	}

	await walk(dir);
	return files;
}

/**
 * Result of bundling declaration files.
 */
interface BundleDtsResult {
	/** Map of entry names to their bundled file paths in temp */
	bundledFiles: Map<string, string>;
	/** Path to the generated API model file (if apiModel was enabled) */
	apiModelPath?: string;
	/** Path to the generated tsdoc-metadata.json file (if enabled) */
	tsdocMetadataPath?: string;
	/** Path to the persisted tsdoc.json file (if persistConfig was enabled) */
	tsdocConfigPath?: string;
}

/**
 * Bundles TypeScript declaration files using API Extractor.
 * Writes bundled output to a temporary directory (not dist).
 * Returns a map of entry names to their bundled file paths in temp.
 * @internal
 */
/* v8 ignore start -- Integration function requiring API Extractor */
async function bundleDtsFiles(options: {
	cwd: string;
	tempDtsDir: string;
	tempOutputDir: string;
	tsconfigPath: string;
	bundledPackages: string[];
	entryPoints: Map<string, string>;
	banner?: string;
	footer?: string;
	apiModel?: ApiModelOptions | boolean;
}): Promise<BundleDtsResult> {
	const { cwd, tempDtsDir, tempOutputDir, tsconfigPath, bundledPackages, entryPoints, banner, footer, apiModel } =
		options;

	const bundledFiles = new Map<string, string>();
	let apiModelPath: string | undefined;
	let tsdocMetadataPath: string | undefined;

	// Normalize apiModel options - enabled by default when apiModel is true or an object without enabled: false
	const apiModelEnabled =
		apiModel === true ||
		(typeof apiModel === "object" && (apiModel.enabled === undefined || apiModel.enabled === true));
	// Temp filename for internal use - final output filename is determined at emission time
	const apiModelFilename = typeof apiModel === "object" && apiModel.filename ? apiModel.filename : "api.json";

	// TSDoc options from apiModel
	const tsdocOptions = typeof apiModel === "object" ? apiModel.tsdoc : undefined;
	const tsdocMetadataOption = typeof apiModel === "object" ? apiModel.tsdocMetadata : undefined;
	// Default: "fail" in CI, "log" locally (user can override with explicit value)
	const tsdocWarnings = tsdocOptions?.warnings ?? (TsDocConfigBuilder.isCI() ? "fail" : "log");

	// tsdocMetadata defaults to enabled when apiModel is enabled
	const tsdocMetadataEnabled =
		apiModelEnabled &&
		(tsdocMetadataOption === undefined ||
			tsdocMetadataOption === true ||
			(typeof tsdocMetadataOption === "object" && tsdocMetadataOption.enabled !== false));
	const tsdocMetadataFilename =
		typeof tsdocMetadataOption === "object" && tsdocMetadataOption.filename
			? tsdocMetadataOption.filename
			: "tsdoc-metadata.json";

	// Validate that API Extractor is installed before attempting import
	getApiExtractorPath();

	// Determine TSDoc config persistence behavior
	const persistConfig = tsdocOptions?.persistConfig;
	const shouldPersist = TsDocConfigBuilder.shouldPersist(persistConfig);
	const tsdocConfigOutputPath = TsDocConfigBuilder.getConfigPath(persistConfig, cwd);

	// Generate tsdoc.json config file for API Extractor
	// Write to the determined path (project root by default, or custom path)
	let tsdocConfigPath: string | undefined;
	let tsdocConfigFile: unknown; // TSDocConfigFile type from @microsoft/tsdoc-config
	if (apiModelEnabled) {
		tsdocConfigPath = await TsDocConfigBuilder.writeConfigFile(tsdocOptions ?? {}, dirname(tsdocConfigOutputPath));

		// Load the TSDocConfigFile object for API Extractor
		// Use loadForFolder to properly resolve the config from the project directory
		const { TSDocConfigFile } = await import("@microsoft/tsdoc-config");
		tsdocConfigFile = TSDocConfigFile.loadForFolder(dirname(tsdocConfigPath));
	}

	const { Extractor, ExtractorConfig } = await import("@microsoft/api-extractor");

	// Process each entry point
	for (const [entryName, sourcePath] of entryPoints) {
		// Determine the .d.ts file path for this entry in temp directory
		// When tsgo runs with --rootDir, it generates files relative to that root
		// Example: sourcePath = "./src/rslib/index.ts" -> try "rslib/index.d.ts" (without src/)
		const normalizedSourcePath = sourcePath.replace(/^\.\//, "");
		const dtsFileName = normalizedSourcePath.replace(/\.(tsx?|jsx?)$/, ".d.ts");
		let tempDtsPath = join(tempDtsDir, dtsFileName);

		// Check if the file exists; if not, try stripping common prefixes like "src/"
		try {
			await access(tempDtsPath, constants.F_OK);
		} catch {
			// File doesn't exist at the direct path, try stripping "src/" prefix
			const withoutSrc = dtsFileName.replace(/^src\//, "");
			if (withoutSrc !== dtsFileName) {
				const alternativePath = join(tempDtsDir, withoutSrc);
				try {
					await access(alternativePath, constants.F_OK);
					// File exists at alternative path, use it
					tempDtsPath = alternativePath;
				} catch {
					// File doesn't exist at either path, use original
					// Will error in API Extractor with a clear message
				}
			}
		}

		// Output path for the bundled .d.ts file in temp directory
		// Always use flat structure: index.d.ts, hooks.d.ts, rslib/index.d.ts
		const outputFileName = `${entryName}.d.ts`;
		const tempBundledPath = join(tempOutputDir, outputFileName);

		// Only generate API model for the main "index" entry
		const generateApiModel = apiModelEnabled && entryName === "index";
		const tempApiModelPath = generateApiModel ? join(tempOutputDir, apiModelFilename) : undefined;

		// Only generate tsdocMetadata for the main "index" entry (alongside API model)
		const generateTsdocMetadata = tsdocMetadataEnabled && entryName === "index";
		const tempTsdocMetadataPath = generateTsdocMetadata ? join(tempOutputDir, tsdocMetadataFilename) : undefined;

		// Create API Extractor configuration
		const extractorConfig = ExtractorConfig.prepare({
			configObject: {
				projectFolder: cwd,
				mainEntryPointFilePath: tempDtsPath,
				compiler: {
					tsconfigFilePath: tsconfigPath,
				},
				dtsRollup: {
					enabled: true,
					untrimmedFilePath: tempBundledPath,
				},
				docModel: generateApiModel
					? {
							enabled: true,
							apiJsonFilePath: tempApiModelPath,
						}
					: undefined,
				tsdocMetadata: generateTsdocMetadata
					? {
							enabled: true,
							tsdocMetadataFilePath: tempTsdocMetadataPath,
						}
					: undefined,
				bundledPackages: bundledPackages,
			},
			packageJsonFullPath: join(cwd, "package.json"),
			configObjectFullPath: undefined,
			tsdocConfigFile: tsdocConfigFile as Parameters<typeof ExtractorConfig.prepare>[0]["tsdocConfigFile"],
		});

		// Collect TSDoc warnings if needed
		interface TsDocWarning {
			text: string;
			sourceFilePath?: string;
			sourceFileLine?: number;
			sourceFileColumn?: number;
		}
		const collectedTsdocWarnings: TsDocWarning[] = [];

		// Run API Extractor
		const extractorResult = Extractor.invoke(extractorConfig, {
			localBuild: true,
			showVerboseMessages: false,
			messageCallback: (message: {
				text?: string;
				logLevel?: string;
				messageId?: string;
				category?: string;
				sourceFilePath?: string;
				sourceFileLine?: number;
				sourceFileColumn?: number;
			}) => {
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

				// Handle TSDoc warnings based on the warnings option
				// TSDoc messages have messageId starting with "tsdoc-"
				const isTsdocMessage = message.messageId?.startsWith("tsdoc-");
				if (isTsdocMessage && message.text) {
					if (tsdocWarnings === "none") {
						message.logLevel = "none";
					} else {
						// Collect for logging or failing (with location info if available)
						collectedTsdocWarnings.push({
							text: message.text,
							sourceFilePath: message.sourceFilePath,
							sourceFileLine: message.sourceFileLine,
							sourceFileColumn: message.sourceFileColumn,
						});
						// Still suppress from API Extractor's default output - we'll handle it ourselves
						message.logLevel = "none";
					}
				}
			},
		});

		if (!extractorResult.succeeded) {
			throw new Error(`API Extractor failed for entry "${entryName}"`);
		}

		// Handle collected TSDoc warnings
		if (collectedTsdocWarnings.length > 0) {
			// Format warnings with location info when available
			const formatWarning = (warning: TsDocWarning): string => {
				const location = warning.sourceFilePath
					? `${color.cyan(relative(cwd, warning.sourceFilePath))}${warning.sourceFileLine ? `:${warning.sourceFileLine}` : ""}${warning.sourceFileColumn ? `:${warning.sourceFileColumn}` : ""}`
					: null;
				return location ? `${location}: ${color.yellow(warning.text)}` : color.yellow(warning.text);
			};

			const warningMessages = collectedTsdocWarnings.map(formatWarning).join("\n  ");
			if (tsdocWarnings === "fail") {
				throw new Error(`TSDoc validation failed for entry "${entryName}":\n  ${warningMessages}`);
			} else if (tsdocWarnings === "log") {
				logger.warn(`TSDoc warnings for entry "${entryName}":\n  ${warningMessages}`);
			}
		}

		// Store the API model path if generated
		if (generateApiModel && tempApiModelPath) {
			apiModelPath = tempApiModelPath;
		}

		// Store the tsdoc-metadata.json path if generated
		if (generateTsdocMetadata && tempTsdocMetadataPath) {
			tsdocMetadataPath = tempTsdocMetadataPath;
		}

		// Apply banner/footer if specified
		if (banner || footer) {
			let content = await readFile(tempBundledPath, "utf-8");
			if (banner) content = `${banner}\n${content}`;
			if (footer) content = `${content}\n${footer}`;
			await writeFile(tempBundledPath, content, "utf-8");
		}

		// Store the bundled file path
		bundledFiles.set(entryName, tempBundledPath);
	}

	// Clean up or persist the generated tsdoc.json based on configuration
	let persistedTsdocConfigPath: string | undefined;
	if (tsdocConfigPath) {
		if (shouldPersist) {
			// Keep the file on disk for tool integration
			persistedTsdocConfigPath = tsdocConfigPath;
		} else {
			// Clean up the temporary file
			try {
				await unlink(tsdocConfigPath);
			} catch {
				// Ignore cleanup errors
			}
		}
	}

	return { bundledFiles, apiModelPath, tsdocMetadataPath, tsdocConfigPath: persistedTsdocConfigPath };
}
/* v8 ignore stop */

/**
 * Strips sourceMappingURL comment from declaration file content.
 * This removes comments like: `//# source` + `MappingURL=index.d.ts.map`
 *
 * @remarks
 * Source maps are preserved in the temp directory for API Extractor documentation
 * but are excluded from the final dist output to reduce package size.
 *
 * @internal
 */
export function stripSourceMapComment(content: string): string {
	return content.replace(/\/\/# sourceMappingURL=\S+\.d\.ts\.map\s*$/gm, "").trim();
}

/**
 * Ensures a temp directory exists for declaration file generation.
 * @internal
 */
export async function ensureTempDeclarationDir(cwd: string, name: string): Promise<string> {
	const dir = join(cwd, ".rslib", "declarations", name);

	// Clean the directory at the start of the build to remove stale files
	// but preserve it after the build for API Extractor documentation generation
	await rm(dir, { recursive: true, force: true });
	await mkdir(dir, { recursive: true });
	return dir;
}

/**
 * Finds the TypeScript config file.
 * @internal
 */
export function findTsConfig(cwd: string, tsconfigPath?: string): string | null {
	// If a path is provided and it's absolute or exists, use it directly
	if (tsconfigPath) {
		const { isAbsolute } = require("node:path");
		if (isAbsolute(tsconfigPath) && sys.fileExists(tsconfigPath)) {
			return tsconfigPath;
		}
	}
	// Otherwise, search for the config file starting from cwd
	return findConfigFile(cwd, sys.fileExists.bind(sys), tsconfigPath) ?? null;
}

/**
 * Loads and parses a TypeScript config file.
 * @internal
 */
/* v8 ignore start -- Integration function with TypeScript compiler API */
function loadTsConfig(configPath: string): ParsedCommandLine {
	const configContent = readConfigFile(configPath, sys.readFile.bind(sys));

	if (configContent.error) {
		throw new Error(`Failed to read tsconfig: ${formatDiagnostic(configContent.error, createCompilerHost({}, true))}`);
	}

	const parsedConfig = parseJsonConfigFileContent(configContent.config, sys, dirname(configPath), {}, configPath);

	if (parsedConfig.errors.length > 0) {
		throw new Error(
			`Failed to parse tsconfig: ${parsedConfig.errors.map((err: Diagnostic) => formatDiagnostic(err, createCompilerHost({}, true))).join("\n")}`,
		);
	}

	return parsedConfig;
}
/* v8 ignore stop */

/**
 * Runs tsgo to generate declaration files.
 * @internal
 */
/* v8 ignore start -- Integration function spawning external process */
function runTsgo(options: {
	configPath: string;
	declarationDir: string;
	rootDir?: string;
	tsBuildInfoFile?: string;
	name: string;
}): Promise<{ success: boolean; output: string }> {
	const { configPath, declarationDir, rootDir, tsBuildInfoFile, name } = options;

	const tsgoBinPath = getTsgoBinPath();
	const args = generateTsgoArgs({ configPath, declarationDir, rootDir, tsBuildInfoFile });

	return new Promise((resolve) => {
		// Spawn tsgo directly (it's a shell script in node_modules/.bin)
		const child = spawn(tsgoBinPath, args, {
			stdio: ["inherit", "pipe", "pipe"],
			shell: false,
		});

		let stdout = "";
		let stderr = "";

		child.stdout?.on("data", (data: Buffer) => {
			const text = data.toString();
			stdout += text;
			logger.info(`${color.dim(`[${name}]`)} ${text.trim()}`);
		});

		child.stderr?.on("data", (data: Buffer) => {
			const text = data.toString();
			stderr += text;
			logger.error(`${color.dim(`[${name}]`)} ${color.red(text.trim())}`);
		});

		child.on("close", (code) => {
			const output = stdout + stderr;
			resolve({
				success: code === 0,
				output,
			});
		});

		child.on("error", (err) => {
			logger.error(`Failed to spawn tsgo: ${err.message}`);
			resolve({
				success: false,
				output: err.message,
			});
		});
	});
}
/* v8 ignore stop */

/**
 * Plugin to generate TypeScript declaration files using tsgo and emit them through Rslib's asset pipeline.
 *
 * @remarks
 * This plugin uses tsgo (`\@typescript/native-preview`) for faster declaration file generation
 * and integrates with Rslib's build system by emitting generated files as compilation assets.
 *
 * ## Features
 *
 * - Uses tsgo exclusively for .d.ts generation (faster than tsc)
 * - Emits .d.ts and .d.ts.map files through Rslib's asset pipeline
 * - Optional bundling with API Extractor for rollup mode
 * - Supports watch mode
 * - Integrates seamlessly with other Rslib plugins
 * - Respects tsconfig.json settings
 *
 * ## Build Workflow
 *
 * 1. **Config Phase** (`modifyRsbuildConfig`):
 *    - Finds and loads tsconfig.json
 *    - Creates temp directory for .d.ts generation
 *    - Validates configuration
 *
 * 2. **Asset Processing Phase** (`processAssets`):
 *    - Cleans temp directory at start of build (to remove stale files)
 *    - Spawns tsgo to generate .d.ts files to temp directory
 *    - Recursively collects all generated .d.ts and .d.ts.map files
 *    - If bundling: uses API Extractor to bundle declarations per entry point
 *    - Emits files through compilation.emitAsset()
 *    - Adds .d.ts files (not .d.ts.map) to the files array for npm publishing
 *    - Preserves temp directory after build for API Extractor documentation generation
 *
 * @param options - Plugin configuration options
 *
 * @example
 * ```typescript
 * import { DtsPlugin } from "@savvy-web/rslib-builder";
 *
 * export default {
 *   plugins: [
 *     DtsPlugin({
 *       abortOnError: true,
 *       bundle: true,
 *       bundledPackages: ['type-fest', '@commitlint/*']
 *     })
 *   ]
 * };
 * ```
 *
 * @public
 */
/* v8 ignore next -- @preserve */
export const DtsPlugin = (options: DtsPluginOptions = {}): RsbuildPlugin => {
	const { abortOnError = true, dtsExtension = ".d.ts" } = options;

	// State shared across hooks
	const state: {
		tsconfigPath: string | null;
		parsedConfig: Awaited<ReturnType<typeof loadTsConfig>> | null;
	} = {
		tsconfigPath: null,
		parsedConfig: null,
	};

	return {
		name: "dts-plugin",
		setup(api: RsbuildPluginAPI): void {
			// Phase 1: Prepare configuration

			api.modifyRsbuildConfig(async (config) => {
				const log = createEnvLogger("dts");
				const cwd = api.context.rootPath;

				try {
					// Use explicitly provided tsconfigPath first, then fall back to config
					let configTsconfigPath = options.tsconfigPath || config.source?.tsconfigPath;

					// If no tsconfig provided and we have a buildTarget, generate a temp config
					if (!configTsconfigPath && options.buildTarget) {
						// Import TSConfigs dynamically to avoid circular dependencies

						// Change working directory temporarily to package root so process.cwd() works correctly
						const originalCwd = process.cwd();
						try {
							process.chdir(cwd);
							configTsconfigPath = TSConfigs.node.ecma.lib.writeBundleTempConfig(options.buildTarget);
							log.global.info(`Using tsconfig: ${configTsconfigPath}`);
						} finally {
							// Restore original working directory
							process.chdir(originalCwd);
						}
					}

					// Find tsconfig
					state.tsconfigPath = findTsConfig(cwd, configTsconfigPath);

					if (!state.tsconfigPath) {
						const error = new Error(
							`Failed to resolve tsconfig file ${color.cyan(`"${config.source?.tsconfigPath ?? "tsconfig.json"}"`)} from ${color.cyan(cwd)}. Please ensure that the file exists.`,
						);
						error.stack = "";
						throw error;
					}

					// Load and parse tsconfig
					state.parsedConfig = loadTsConfig(state.tsconfigPath);

					log.global.info(`Using tsconfig: ${color.cyan(relative(cwd, state.tsconfigPath))}`);
				} catch (error) {
					log.global.error("Failed to initialize DTS plugin:", error);
					throw error;
				}

				return config;
			});

			// Phase 2: Generate and emit declaration files
			api.processAssets(
				{
					stage: "pre-process",
				},
				async (context) => {
					if (!state.tsconfigPath || !state.parsedConfig) {
						logger.warn("DTS plugin not properly initialized, skipping declaration generation");
						return;
					}

					const envId = context.compilation?.name || "unknown";
					const log = createEnvLogger(envId);
					const cwd = api.context.rootPath;

					// Create temp directory for this environment
					const tempDtsDir = await ensureTempDeclarationDir(cwd, envId);

					// Get files array for adding .d.ts files (but not .d.ts.map)
					const filesArray = api.useExposed("files-array") as Set<string> | undefined;

					try {
						logger.info(`${color.dim(`[${envId}]`)} Generating declaration files...`);

						// Run tsgo to generate .d.ts files
						const { success, output } = await runTsgo({
							configPath: state.tsconfigPath,
							declarationDir: tempDtsDir,
							rootDir: state.parsedConfig.options.rootDir,
							tsBuildInfoFile: state.parsedConfig.options.tsBuildInfoFile,
							name: envId,
						});

						if (!success) {
							const errorMsg = `TypeScript declaration generation failed:\n${output}`;
							if (abortOnError) {
								throw new Error(errorMsg);
							}
							log.global.error(errorMsg);
							log.global.warn(
								"With `abortOnError` disabled, type errors will not fail the build, but proper type declaration output cannot be guaranteed.",
							);
							return;
						}

						// Collect all generated .d.ts and .d.ts.map files
						const allDtsFiles = await collectDtsFiles(tempDtsDir);

						// Check if API report plugin created a temp api-extractor file
						const apiExtractorMapping = api.useExposed("api-extractor-temp-mapping") as
							| { tempPath: string; originalPath: string }
							| undefined;

						if (apiExtractorMapping) {
							// The temp api-extractor file was created in src/ and compiled by the main tsgo run
							// Find the generated declaration and rename it to match the original path

							// Get the relative path of the temp file from package root
							const tempFileRelative = relative(cwd, apiExtractorMapping.tempPath);

							for (const file of allDtsFiles) {
								// The temp file is like src/api-extractor-abc123.ts
								// which generates src/api-extractor-abc123.d.ts
								const expectedPath = tempFileRelative.replace(/\.ts$/, ".d.ts");
								const expectedMapPath = `${expectedPath}.map`;

								if (file.relativePath === expectedPath || file.relativePath === expectedMapPath) {
									// This is a declaration from the temp file - rename it to the original path
									const ext = file.relativePath.endsWith(".map") ? ".d.ts.map" : ".d.ts";
									const originalDtsPath = apiExtractorMapping.originalPath.replace(/\.ts$/, ext);
									const newPath = join(tempDtsDir, originalDtsPath);

									// Ensure the directory exists
									await mkdir(dirname(newPath), { recursive: true });

									// Copy the file to the new location
									await copyFile(file.path, newPath);
									log.global.info(`Renamed ${file.relativePath} -> ${originalDtsPath} (from temp api-extractor)`);

									// Delete the original temp-named file
									await unlink(file.path);
								}
							}

							// Re-collect files after renaming
							allDtsFiles.length = 0;
							allDtsFiles.push(...(await collectDtsFiles(tempDtsDir)));
						}

						// Filter out test files - we don't want to distribute these
						const dtsFiles = allDtsFiles.filter((file) => {
							const path = file.relativePath;
							return !path.includes("__test__/") && !path.includes(".test.d.ts");
						});

						if (dtsFiles.length === 0) {
							log.global.warn("No declaration files were generated");
							return;
						}

						// Check if we should bundle declarations with API Extractor
						if (options.bundle) {
							try {
								// Read package.json to discover entry points
								// First check if api-report-plugin exposed a modified version
								const exposedPackageJson = api.useExposed<PackageJson>("api-extractor-package-json");

								let packageJson: PackageJson;
								if (!exposedPackageJson) {
									// No modified version, read from disk
									const packageJsonPath = join(cwd, "package.json");
									const packageJsonContent = await readFile(packageJsonPath, "utf-8");
									packageJson = JSON.parse(packageJsonContent);
								} else {
									log.global.info("Using in-memory package.json from api-report-plugin");
									packageJson = exposedPackageJson;
								}

								// Only process the main export (".") for API Extractor bundling
								const entryPoints = new Map<string, string>();

								if (packageJson.exports) {
									const exports = packageJson.exports as Record<string, unknown>;
									const mainExport = exports["."];

									if (mainExport) {
										// Handle both string and object export values
										const sourcePath =
											typeof mainExport === "string" ? mainExport : (mainExport as { default?: string })?.default;

										if (sourcePath && typeof sourcePath === "string") {
											// Only process TypeScript source files (skip JSON, CSS, declaration files, etc.)
											if (sourcePath.match(/\.(ts|mts|cts|tsx)$/)) {
												// Skip test files
												if (!sourcePath.includes(".test.") && !sourcePath.includes("__test__")) {
													// Skip files outside the package root (e.g., temp files in /tmp/)
													const resolvedSourcePath = sourcePath.startsWith(".") ? join(cwd, sourcePath) : sourcePath;
													if (resolvedSourcePath.startsWith(cwd)) {
														// If this is the temp api-extractor file, use the original path instead
														let finalSourcePath = sourcePath;
														if (apiExtractorMapping && resolvedSourcePath === apiExtractorMapping.tempPath) {
															finalSourcePath = apiExtractorMapping.originalPath;
															log.global.info(`Using original path for api-extractor: ${finalSourcePath}`);
														}

														// Store main export as "index" entry
														entryPoints.set("index", finalSourcePath);
													} else {
														log.global.info(`Skipping main export (source outside package: ${sourcePath})`);
													}
												}
											}
										}
									}
								}

								if (entryPoints.size === 0) {
									log.global.warn("No main export found in package.json exports, skipping bundling");
								} else {
									// Create temp directory for bundled output
									const tempBundledDir = join(tempDtsDir, "bundled");
									await mkdir(tempBundledDir, { recursive: true });

									// Bundle declarations using API Extractor (writes to temp directory)
									const { bundledFiles, apiModelPath, tsdocMetadataPath, tsdocConfigPath } = await bundleDtsFiles({
										cwd,
										tempDtsDir,
										tempOutputDir: tempBundledDir,
										tsconfigPath: state.tsconfigPath,
										bundledPackages: options.bundledPackages || [],
										entryPoints,
										banner: options.banner,
										footer: options.footer,
										apiModel: options.apiModel,
									});

									// Emit bundled .d.ts files from temp directory through asset pipeline
									let emittedCount = 0;
									for (const [entryName, tempBundledPath] of bundledFiles) {
										// Determine final output file name
										// Always use flat structure: index.d.ts, hooks.d.ts, foo/bar.d.ts
										const bundledFileName = `${entryName}.d.ts`;

										// Read from temp and strip sourceMappingURL comment before emitting
										let content = await readFile(tempBundledPath, "utf-8");
										content = stripSourceMapComment(content);
										const source = new context.sources.OriginalSource(content, bundledFileName);
										context.compilation.emitAsset(bundledFileName, source);
										emittedCount++;

										// Add .d.ts file to files array (but not .d.ts.map files)
										if (filesArray) {
											filesArray.add(bundledFileName);
										}
									}

									logger.info(
										`${color.dim(`[${envId}]`)} Emitted ${emittedCount} bundled declaration file${emittedCount === 1 ? "" : "s"} through asset pipeline`,
									);

									// Emit API model file if generated
									if (apiModelPath) {
										// Default filename follows API Extractor convention: <unscopedPackageName>.api.json
										const defaultApiModelFilename = packageJson.name
											? `${getUnscopedPackageName(packageJson.name)}.api.json`
											: "api.json";
										const apiModelFilename =
											typeof options.apiModel === "object" && options.apiModel.filename
												? options.apiModel.filename
												: defaultApiModelFilename;
										const apiModelContent = await readFile(apiModelPath, "utf-8");
										const apiModelSource = new context.sources.OriginalSource(apiModelContent, apiModelFilename);
										context.compilation.emitAsset(apiModelFilename, apiModelSource);

										// Add negated pattern to files array to exclude from npm publish
										// The file is still emitted to dist for local tooling use
										if (filesArray) {
											filesArray.add(`!${apiModelFilename}`);
										}

										logger.info(
											`${color.dim(`[${envId}]`)} Emitted API model: ${apiModelFilename} (excluded from npm publish)`,
										);

										// Expose data needed for localPaths copying in onCloseBuild
										// (files are read from dist after build completes, ensuring transformed package.json)
										const localPaths = typeof options.apiModel === "object" ? options.apiModel.localPaths : undefined;
										const isCI = process.env.GITHUB_ACTIONS === "true" || process.env.CI === "true";

										if (localPaths && localPaths.length > 0 && !isCI) {
											const tsdocMetadataOption =
												typeof options.apiModel === "object" ? options.apiModel.tsdocMetadata : undefined;
											const localTsdocFilename =
												typeof tsdocMetadataOption === "object" && tsdocMetadataOption.filename
													? tsdocMetadataOption.filename
													: "tsdoc-metadata.json";

											api.expose("dts-local-paths-data", {
												localPaths,
												apiModelFilename,
												localTsdocFilename,
												hasTsdocMetadata: !!tsdocMetadataPath,
												cwd,
												distPath: `dist/${envId}`,
											});
										}
									}

									// Emit tsdoc-metadata.json file if generated
									if (tsdocMetadataPath) {
										const tsdocMetadataOption =
											typeof options.apiModel === "object" ? options.apiModel.tsdocMetadata : undefined;
										const tsdocMetadataFilename =
											typeof tsdocMetadataOption === "object" && tsdocMetadataOption.filename
												? tsdocMetadataOption.filename
												: "tsdoc-metadata.json";
										const tsdocMetadataContent = await readFile(tsdocMetadataPath, "utf-8");
										const tsdocMetadataSource = new context.sources.OriginalSource(
											tsdocMetadataContent,
											tsdocMetadataFilename,
										);
										context.compilation.emitAsset(tsdocMetadataFilename, tsdocMetadataSource);

										// Add to files array for npm publish (TSDoc spec requires this file to be published)
										if (filesArray) {
											filesArray.add(tsdocMetadataFilename);
										}

										logger.info(`${color.dim(`[${envId}]`)} Emitted TSDoc metadata: ${tsdocMetadataFilename}`);
									}

									// Emit tsdoc.json to dist (excluded from npm publish, but available for tooling)
									if (tsdocConfigPath) {
										const tsdocConfigContent = await readFile(tsdocConfigPath, "utf-8");
										const tsdocConfigSource = new context.sources.OriginalSource(tsdocConfigContent, "tsdoc.json");
										context.compilation.emitAsset("tsdoc.json", tsdocConfigSource);

										// Add negated pattern to exclude from npm publish
										if (filesArray) {
											filesArray.add("!tsdoc.json");
										}

										logger.info(
											`${color.dim(`[${envId}]`)} Emitted TSDoc config: tsdoc.json (excluded from npm publish)`,
										);
									}

									// Remove .d.ts.map files that Rspack auto-generates for our emitted .d.ts assets
									// We keep .d.ts.map files in the declarations directory for API Extractor, but dont want them in dist
									for (const [entryName] of bundledFiles) {
										const bundledFileName = `${entryName}.d.ts`;
										const mapFileName = `${bundledFileName}.map`;

										// Remove .d.ts.map files that Rspack auto-generates for our emitted .d.ts assets
										// We keep .d.ts.map files in the declarations directory for API Extractor, but dont want them in dist
										for (const file of dtsFiles) {
											if (file.relativePath.endsWith(".d.ts.map")) {
												continue;
											}
											let outputPath = file.relativePath;
											if (outputPath.startsWith("src/")) {
												outputPath = outputPath.slice(4);
											}
											if (dtsExtension !== ".d.ts" && outputPath.endsWith(".d.ts")) {
												outputPath = outputPath.replace(/\.d\.ts$/, dtsExtension);
											}
											const mapFileName = `${outputPath}.map`;
											if (context.compilation.assets[mapFileName]) {
												delete context.compilation.assets[mapFileName];
											}
										}

										if (context.compilation.assets[mapFileName]) {
											delete context.compilation.assets[mapFileName];
										}
									}
								}
							} catch (error) {
								log.global.error("Failed to bundle declaration files:", error);
								if (abortOnError) {
									throw error;
								}
							}
						} else {
							// Emit each file individually through the asset pipeline
							let emittedCount = 0;
							for (const file of dtsFiles) {
								// Skip .d.ts.map files - keep them only in temp directory for API Extractor
								if (file.relativePath.endsWith(".d.ts.map")) {
									continue;
								}

								let content = await readFile(file.path, "utf-8");

								// Determine output path relative to dist
								// Strip 'src/' prefix if present since tsgo preserves source directory structure
								let outputPath = file.relativePath;
								if (outputPath.startsWith("src/")) {
									outputPath = outputPath.slice(4); // Remove 'src/'
								}

								// Apply custom extension if specified and different from default
								if (dtsExtension !== ".d.ts" && outputPath.endsWith(".d.ts")) {
									outputPath = outputPath.replace(/\.d\.ts$/, dtsExtension);
								}

								// Strip sourceMappingURL comment before emitting to dist
								content = stripSourceMapComment(content);

								// Create source and emit asset
								const source = new context.sources.OriginalSource(content, outputPath);
								context.compilation.emitAsset(outputPath, source);
								emittedCount++;

								// Add .d.ts files to files array
								if (filesArray && outputPath.endsWith(".d.ts")) {
									filesArray.add(outputPath);
								}
							}

							logger.info(
								`${color.dim(`[${envId}]`)} Emitted ${emittedCount} declaration file${emittedCount === 1 ? "" : "s"} through asset pipeline`,
							);
						}
					} catch (error) {
						log.global.error("Failed to generate declaration files:", error);
						if (abortOnError) {
							throw error;
						}
					}
				},
			);
			// Add another hook at a later stage to:
			// 1. Strip sourceMappingURL comments from .d.ts files
			// 2. Remove .d.ts.map files that Rspack auto-generates
			api.processAssets(
				{
					stage: "summarize",
				},
				async (compiler) => {
					const assetsToDelete: string[] = [];

					// Process all .d.ts files to strip sourceMappingURL comments
					for (const assetName in compiler.compilation.assets) {
						if (assetName.endsWith(".d.ts")) {
							const asset = compiler.compilation.assets[assetName];
							const content = asset.source().toString();

							// Strip sourceMappingURL comment
							const strippedContent = stripSourceMapComment(content);

							// Only update if content changed
							if (strippedContent !== content) {
								const source = new compiler.sources.OriginalSource(strippedContent, assetName);
								compiler.compilation.assets[assetName] = source;
							}
						} else if (assetName.endsWith(".d.ts.map")) {
							// Mark .d.ts.map files for deletion
							// We keep these files in the declarations directory for API Extractor documentation
							assetsToDelete.push(assetName);
						}
					}

					// Delete .d.ts.map files
					for (const assetName of assetsToDelete) {
						delete compiler.compilation.assets[assetName];
					}
				},
			);

			// Copy files to localPaths after build completes (all files written to dist)
			api.onCloseBuild(async () => {
				const localPathsData = api.useExposed<{
					localPaths: string[];
					apiModelFilename: string;
					localTsdocFilename: string;
					hasTsdocMetadata: boolean;
					cwd: string;
					distPath: string;
				}>("dts-local-paths-data");

				if (!localPathsData) {
					return;
				}

				const { localPaths, apiModelFilename, localTsdocFilename, hasTsdocMetadata, cwd, distPath } = localPathsData;
				const distDir = join(cwd, distPath);

				for (const localPath of localPaths) {
					const resolvedPath = join(cwd, localPath);
					const parentDir = dirname(resolvedPath);

					// Validate parent directory exists
					if (!existsSync(parentDir)) {
						logger.warn(`Skipping local path: parent directory does not exist: ${parentDir}`);
						continue;
					}

					// Collect all files to copy
					const filesToCopy: Array<{ src: string; dest: string; name: string }> = [];

					// API model
					const apiModelSrc = join(distDir, apiModelFilename);
					if (existsSync(apiModelSrc)) {
						filesToCopy.push({
							src: apiModelSrc,
							dest: join(resolvedPath, apiModelFilename),
							name: apiModelFilename,
						});
					}

					// tsdoc-metadata.json
					if (hasTsdocMetadata) {
						const tsdocSrc = join(distDir, localTsdocFilename);
						if (existsSync(tsdocSrc)) {
							filesToCopy.push({
								src: tsdocSrc,
								dest: join(resolvedPath, localTsdocFilename),
								name: localTsdocFilename,
							});
						}
					}

					// package.json (transformed version from dist)
					const packageJsonSrc = join(distDir, "package.json");
					if (existsSync(packageJsonSrc)) {
						filesToCopy.push({
							src: packageJsonSrc,
							dest: join(resolvedPath, "package.json"),
							name: "package.json",
						});
					}

					// Create target directory and copy all files
					await mkdir(resolvedPath, { recursive: true });

					for (const file of filesToCopy) {
						const content = await readFile(file.src, "utf-8");
						await writeFile(file.dest, content, "utf-8");
					}

					const fileNames = filesToCopy.map((f) => f.name).join(", ");
					logger.info(`Copied ${fileNames} to: ${localPath}`);
				}
			});
		},
	};
};
