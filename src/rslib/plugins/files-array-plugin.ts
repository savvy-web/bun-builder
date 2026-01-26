import type { RsbuildPlugin, RsbuildPluginAPI } from "@rsbuild/core";
import type { PackageJson } from "type-fest";
import { JsonAsset, TextAsset } from "./utils/asset-utils.js";
import { createEnvLogger } from "./utils/build-logger.js";

/**
 * Options for the FilesArrayPlugin.
 *
 * @typeParam TTarget - The build target type, defaults to string
 *
 * @public
 */
export interface FilesArrayPluginOptions<TTarget extends string = string> {
	/**
	 * Optional callback to transform files after they're built but before the files array is finalized.
	 *
	 * @remarks
	 * Called during the "additional" stage of asset processing, after all other assets are created.
	 * Use this to copy/rename files or add additional files to the build output.
	 *
	 * @param context - Transform context containing:
	 *   - `compilation`: Rspack compilation object with assets
	 *   - `filesArray`: Set of files to be included in package.json `files` field
	 *   - `target`: Current build target
	 *
	 * @example
	 * ```typescript
	 * import type { FilesArrayPluginOptions } from '@savvy-web/rslib-builder';
	 *
	 * const options: FilesArrayPluginOptions = {
	 *   target: 'npm',
	 *   transformFiles({ compilation, filesArray }) {
	 *     // Add a custom file to the output
	 *     filesArray.add('custom-file.txt');
	 *   },
	 * };
	 * ```
	 */
	transformFiles?: (context: {
		/** Rspack compilation object with assets */
		compilation: {
			assets: Record<string, unknown>;
		};
		/** Set of files to include in package.json files array */
		filesArray: Set<string>;
		/** Current build target */
		target: TTarget;
	}) => void | Promise<void>;

	/**
	 * Build target identifier (e.g., "dev", "npm").
	 *
	 * @remarks
	 * Passed to the `transformFiles` callback to allow target-specific transformations.
	 */
	target: TTarget;
}

/**
 * Plugin to manage the `files` array in package.json for npm publishing.
 *
 * @remarks
 * This plugin automatically populates the `files` field in the output package.json
 * with all compiled assets and essential files. Other plugins can add files via
 * the shared `files-array` exposed through the Rsbuild API.
 *
 * ## Files Included
 *
 * - Essential files: package.json, README.md, LICENSE
 * - All compiled JavaScript files
 * - All declaration files (.d.ts)
 * - Files added by other plugins via `api.useExposed("files-array")`
 *
 * ## Files Excluded
 *
 * - Source map files (.map)
 * - Files prefixed with `!` in the files array (negated patterns)
 *
 * ## Plugin Interoperability
 *
 * Other plugins can add files to the array:
 * ```typescript
 * const filesArray = api.useExposed("files-array") as Set<string>;
 * filesArray.add("my-custom-file.json");
 * ```
 *
 * @param options - Plugin configuration options
 *
 * @example
 * Basic usage:
 * ```typescript
 * import { FilesArrayPlugin } from '@savvy-web/rslib-builder';
 *
 * export default {
 *   plugins: [
 *     FilesArrayPlugin({ target: 'npm' }),
 *   ],
 * };
 * ```
 *
 * @example
 * With custom file transformation:
 * ```typescript
 * import { FilesArrayPlugin } from '@savvy-web/rslib-builder';
 *
 * export default {
 *   plugins: [
 *     FilesArrayPlugin({
 *       target: 'npm',
 *       transformFiles({ filesArray }) {
 *         filesArray.add('CHANGELOG.md');
 *       },
 *     }),
 *   ],
 * };
 * ```
 *
 * @public
 */
export const FilesArrayPlugin = <TTarget extends string = string>(
	options?: FilesArrayPluginOptions<TTarget>,
): RsbuildPlugin => {
	return {
		name: "files-array-plugin",
		post: ["rsbuild:dts"],
		setup(api: RsbuildPluginAPI): void {
			// Run during the main compilation to handle compiled assets and essential files

			let filesArray = api.useExposed("files-array") as Set<string> | undefined;
			if (!filesArray) {
				filesArray = new Set<string>();
				api.expose("files-array", filesArray);
			}

			api.processAssets(
				{
					stage: "additional", // Run at the very end after all assets are created
				},
				async (context) => {
					// Get or create the shared files array

					// Add essential files that are always included
					const packageJson = await JsonAsset.create<PackageJson>(context, "package.json", false);
					if (packageJson) {
						filesArray.add(packageJson.fileName);
					}
					const readme = await TextAsset.create(context, "README.md", false);
					if (readme) {
						filesArray.add(readme.fileName);
					}

					const license = await TextAsset.create(context, "LICENSE", false);
					if (license) {
						filesArray.add(license.fileName);
					}

					// Add all compiled JS and other assets (but not source maps)
					for (const assetName of Object.keys(context.compilation.assets)) {
						// Skip source maps as they're typically not published
						// Skip files already added
						if (!assetName.endsWith(".map") && !filesArray.has(assetName)) {
							filesArray.add(assetName);
						}
					}

					// Call user-provided transformFiles callback if provided
					if (options?.transformFiles) {
						await options.transformFiles({
							compilation: context.compilation,
							filesArray,
							target: options.target,
						});
					}
				},
			);

			api.processAssets(
				{
					stage: "optimize-inline",
				},
				async (context) => {
					// Extract environment from compilation name or options
					const envId = context.compilation?.name || context.compilation?.options?.name || "unknown";

					const log = createEnvLogger(envId);

					const packageJson = await JsonAsset.create<PackageJson>(context, "package.json", false);

					// Update package.json with the accumulated files array
					if (packageJson) {
						// Debug: log what's in the filesArray before writing

						// Get existing files from package.json
						const previousFiles = new Set(packageJson.data.files || []);

						// Combine existing files with new essential files from filesArray
						const allFiles = new Set([...previousFiles, ...Array.from(filesArray)].sort());

						if (allFiles.size === 0) {
							delete packageJson.data.files;
						} else {
							// Calculate difference manually for compatibility
							const newFiles = new Set([...allFiles].filter((file) => !previousFiles.has(file)));
							if (newFiles.size > 0) {
								log.fileOp("added to files array", Array.from(newFiles));
							}
						}

						packageJson.data.files = Array.from(allFiles);

						packageJson.update();
					}
				},
			);
		},
	};
};
