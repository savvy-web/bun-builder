import { readFile } from "node:fs/promises";
import type { RsbuildPlugin, RsbuildPluginAPI } from "@rsbuild/core";
import type { PackageJson } from "type-fest";
import { createEnvLogger } from "./utils/build-logger.js";
import { extractEntriesFromPackageJson } from "./utils/entry-extractor.js";
import { fileExistAsync } from "./utils/file-utils.js";

/**
 * Options for the AutoEntryPlugin.
 * @public
 */
export interface AutoEntryPluginOptions {
	/**
	 * When enabled, export paths create `index.js` files in nested directories
	 * instead of using the export name as the filename.
	 *
	 * @remarks
	 * This is useful when you want cleaner import paths that don't require
	 * specifying a filename, relying on Node's directory index resolution.
	 *
	 * @example
	 * With `exportsAsIndexes: true` and this package.json:
	 * ```json
	 * {
	 *   "exports": {
	 *     ".": "./src/index.ts",
	 *     "./utils": "./src/utils/index.ts"
	 *   }
	 * }
	 * ```
	 *
	 * Output structure:
	 * ```
	 * dist/
	 *   index.js
	 *   utils/
	 *     index.js
	 * ```
	 *
	 * @defaultValue false
	 */
	exportsAsIndexes?: boolean;
}

/**
 * Plugin to automatically detect and configure entry points from package.json exports.
 *
 * @remarks
 * This plugin reads your package.json exports field and automatically configures
 * RSlib entry points, eliminating the need to manually specify entries in your config.
 *
 * ## Features
 *
 * - Automatically extracts entry points from package.json `exports` field
 * - Supports both string and object export values
 * - Handles bin field entries for CLI tools
 * - Exposes entrypoints map for other plugins to consume
 *
 * ## How It Works
 *
 * 1. Reads package.json from the project root
 * 2. Extracts entry points from the `exports` field
 * 3. Configures RSlib with the discovered entries
 * 4. Exposes the entrypoints map via `api.useExposed("entrypoints")`
 *
 * @param options - Plugin configuration options
 *
 * @example
 * Basic usage (entries detected from package.json):
 * ```typescript
 * import { AutoEntryPlugin } from '@savvy-web/rslib-builder';
 *
 * export default {
 *   plugins: [AutoEntryPlugin()],
 * };
 * ```
 *
 * @example
 * With nested directory output:
 * ```typescript
 * import { AutoEntryPlugin } from '@savvy-web/rslib-builder';
 *
 * export default {
 *   plugins: [
 *     AutoEntryPlugin({ exportsAsIndexes: true }),
 *   ],
 * };
 * ```
 *
 * @public
 */
export const AutoEntryPlugin = (options?: AutoEntryPluginOptions): RsbuildPlugin => {
	// Use WeakMap to track per-api instance state to prevent state leakage between different build instances
	const buildStateMap = new WeakMap<RsbuildPluginAPI, { hasLoggedEntries: boolean; hasLoggedSchemas: boolean }>();
	return {
		name: "auto-entry-plugin",
		setup(api: RsbuildPluginAPI): void {
			// Initialize state for this API instance
			buildStateMap.set(api, { hasLoggedEntries: false, hasLoggedSchemas: false });
			let entrypoints = api.useExposed<Map<string, string>>("entrypoints");
			if (!entrypoints) {
				entrypoints = new Map<string, string>();
				api.expose("entrypoints", entrypoints);
			}

			// Create a map to store export key to output path mappings for exportsAsIndexes
			let exportToOutputMap = api.useExposed<Map<string, string>>("exportToOutputMap");
			if (!exportToOutputMap) {
				exportToOutputMap = new Map<string, string>();
				api.expose("exportToOutputMap", exportToOutputMap);
			}

			api.onBeforeBuild(async (context) => {
				api.logger.debug(context);
			});

			api.modifyRsbuildConfig(async (config) => {
				const log = createEnvLogger("auto-entry");
				const { assetPath, assetExists } = await fileExistAsync("package.json");

				if (!assetExists) {
					log.global.error("package.json not found in project root");
					throw new Error("package.json not found in project root");
				}

				try {
					const packageJsonContent = await readFile(assetPath, "utf-8");
					const packageJson = JSON.parse(packageJsonContent) as PackageJson;

					// Extract entries from package.json exports and bin fields
					const { entries } = extractEntriesFromPackageJson(packageJson, {
						exportsAsIndexes: options?.exportsAsIndexes,
					});

					// When exportsAsIndexes is enabled, build a mapping from export keys to output paths
					if (options?.exportsAsIndexes && packageJson.exports) {
						const exports = packageJson.exports;
						if (typeof exports === "object" && !Array.isArray(exports)) {
							// Iterate over package.json exports to map them to entry names
							for (const pkgExportKey of Object.keys(exports)) {
								// Skip package.json exports
								if (pkgExportKey === "./package.json") continue;

								// Normalize the export key for comparison
								const normalizedExportKey = pkgExportKey.replace(/^\.\//, "");

								// Find the matching entry
								for (const [entryName] of Object.entries(entries)) {
									// The entry name might be "vscode/settings/index" and export key is "./vscode/settings"
									const normalizedEntryName = entryName.replace(/\/index$/, "");

									// Match root export "." to "index" entry, or match normalized paths
									if ((pkgExportKey === "." && entryName === "index") || normalizedExportKey === normalizedEntryName) {
										// Map the export key to the output path (entry name with .js extension)
										const outputPath = `./${entryName}.js`;
										exportToOutputMap.set(pkgExportKey, outputPath);
										break; // Found the match, move to next export
									}
								}
							}
						}
					}

					// Populate the unified entrypoints Map for other plugins to use
					for (const [entryName, sourcePath] of Object.entries(entries)) {
						// Convert entry names to TypeScript output names with .ts extension
						const outputName = `${entryName}.ts`;
						entrypoints.set(outputName, sourcePath);
					}

					// JSON schema exports are no longer processed here - they should be generated via separate scripts

					if (Object.keys(entries).length > 0) {
						const environments = Object.entries(config?.environments ?? {});

						// Apply entries to each environment
						environments.forEach(([_env, lib]) => {
							lib.source = {
								...lib.source,
								entry: {
									...lib.source?.entry,
									...entries,
								},
							};
						});

						// Log entries only once per build process
						const state = buildStateMap.get(api);
						if (state && !state.hasLoggedEntries) {
							state.hasLoggedEntries = true;
							environments.forEach(([env]) => {
								const log = createEnvLogger(env);
								log.entries("auto-detected entries", entries);
							});
						}
					}
					/* v8 ignore start - Hard to test JSON parsing errors */
				} catch (error) {
					log.global.error("failed to process package.json:", error);
				}
				/* v8 ignore stop */

				return config;
			});
		},
	};
};
