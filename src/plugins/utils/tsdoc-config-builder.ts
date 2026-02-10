import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { StandardTags, Standardization, TSDocTagSyntaxKind } from "@microsoft/tsdoc";
import type { TsDocOptions, TsDocTagDefinition, TsDocTagGroup } from "../../types/builder-types.js";
import { BuildLogger } from "./logger.js";

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
 * The builder supports three standardization groups from `@microsoft/tsdoc`:
 * - `core`: Essential tags (`@param`, `@returns`, `@remarks`, etc.)
 * - `extended`: Additional tags (`@example`, `@defaultValue`, `@see`, etc.)
 * - `discretionary`: Release tags (`@alpha`, `@beta`, `@public`, `@internal`)
 *
 * @example
 * Build tag configuration from options:
 * ```typescript
 * import { TsDocConfigBuilder } from '@savvy-web/bun-builder';
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
 * import { TsDocConfigBuilder } from '@savvy-web/bun-builder';
 *
 * const configPath = await TsDocConfigBuilder.writeConfigFile(
 *   { groups: ['core', 'extended', 'discretionary'] },
 *   process.cwd(),
 * );
 * ```
 *
 * @internal
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
	 * Lazily computed from `@microsoft/tsdoc` StandardTags.
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
	 *
	 * @remarks
	 * Delegates to {@link BuildLogger.isCI} for consistent CI detection
	 * across the codebase.
	 *
	 * @returns `true` if running in a CI environment
	 */
	static isCI(): boolean {
		return BuildLogger.isCI();
	}

	/**
	 * Gets standard TSDoc tag definitions for a specific group.
	 * Uses StandardTags from `@microsoft/tsdoc` package.
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
	static shouldPersist(persistConfig: boolean | string | undefined): boolean {
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
	static getConfigPath(persistConfig: boolean | string | undefined, cwd: string): string {
		if (typeof persistConfig === "string") {
			return isAbsolute(persistConfig) ? persistConfig : join(cwd, persistConfig);
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
	 * Builds the tsdoc.json config object without writing to disk.
	 *
	 * @param options - TSDoc configuration options
	 * @returns The config object ready to be serialized
	 */
	static buildConfigObject(options: TsDocOptions = {}): Record<string, unknown> {
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

		return tsdocConfig;
	}

	/**
	 * Validates that an existing tsdoc.json matches the expected configuration.
	 *
	 * @remarks
	 * Used in CI environments to ensure the committed tsdoc.json is up to date.
	 * Throws an error if the file is missing or its content differs from what
	 * the build would generate.
	 *
	 * @param options - TSDoc configuration options
	 * @param configPath - Path to the existing tsdoc.json file
	 * @throws If the file is missing, unparseable, or out of date
	 */
	static async validateConfigFile(options: TsDocOptions = {}, configPath: string): Promise<void> {
		const expectedConfig = TsDocConfigBuilder.buildConfigObject(options);

		if (!existsSync(configPath)) {
			throw new Error(
				`tsdoc.json not found at ${configPath}. Run the build locally to generate it, then commit the file.`,
			);
		}

		let existingConfig: unknown;
		try {
			const existingContent = await readFile(configPath, "utf-8");
			existingConfig = JSON.parse(existingContent);
		} catch (error) {
			throw new Error(
				`Failed to parse existing tsdoc.json at ${configPath}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		if (JSON.stringify(existingConfig) !== JSON.stringify(expectedConfig)) {
			throw new Error("tsdoc.json is out of date. Run the build locally to regenerate it, then commit the changes.");
		}
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
	 *
	 * In CI environments, validates the existing file instead of writing,
	 * throwing an error if the config is out of date.
	 *
	 * @param options - TSDoc configuration options
	 * @param outputPath - Directory path or full file path (if ending in .json)
	 * @param skipCIValidation - Skip CI validation even in CI environments
	 */
	static async writeConfigFile(
		options: TsDocOptions = {},
		outputPath: string,
		skipCIValidation = false,
	): Promise<string> {
		// Allow callers to provide either a directory or a full config file path.
		const configPath = outputPath.endsWith(".json") ? outputPath : join(outputPath, "tsdoc.json");

		// In CI, validate instead of write (unless explicitly skipped)
		if (TsDocConfigBuilder.isCI() && !skipCIValidation) {
			await TsDocConfigBuilder.validateConfigFile(options, configPath);
			return configPath;
		}

		const tsdocConfig = TsDocConfigBuilder.buildConfigObject(options);

		// Check if file exists and compare objects to avoid unnecessary writes
		if (existsSync(configPath)) {
			try {
				const existingContent = await readFile(configPath, "utf-8");
				const existingConfig = JSON.parse(existingContent);
				// Simple deep compare for our use case
				if (JSON.stringify(existingConfig) === JSON.stringify(tsdocConfig)) {
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
