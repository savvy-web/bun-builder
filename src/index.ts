/**
 * RSLib-based build system for Node.js libraries with automatic package.json transformation,
 * TypeScript declaration bundling, and multi-target support.
 *
 * @remarks
 * This package provides a powerful builder system built on top of RSLib that simplifies the
 * process of building modern ESM Node.js libraries. It offers:
 *
 * - **Automatic Entry Detection**: Auto-detects entry points from package.json exports
 * - **Multi-Target Builds**: Support for dev and npm build targets
 * - **Bundled ESM Output**: Optimized single-file outputs with rolled-up types
 * - **Package.json Transformation**: Automatic path updates, PNPM catalog resolution
 * - **TypeScript Declaration Bundling**: Using tsgo and API Extractor
 * - **File Array Generation**: Automatic files array creation for package.json
 * - **API Model Generation**: Optional `<packageName>.api.json` for documentation tooling
 *
 * @example
 * Basic usage in rslib.config.ts:
 * ```typescript
 * import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';
 *
 * export default NodeLibraryBuilder.create({});
 * ```
 *
 * @example
 * With custom transformations:
 * ```typescript
 * import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';
 *
 * export default NodeLibraryBuilder.create({
 *   externals: ['@rslib/core'],
 *   transform({ pkg }) {
 *     delete pkg.devDependencies;
 *     return pkg;
 *   }
 * });
 * ```
 *
 * @packageDocumentation
 */

/* v8 ignore start - Export module, tested through consuming packages */

// Core builder
export type {
	BuildTarget,
	NodeLibraryBuilderOptions,
	TransformPackageJsonFn,
} from "./rslib/builders/node-library-builder.js";

export { NodeLibraryBuilder } from "./rslib/builders/node-library-builder.js";
export type { AutoEntryPluginOptions } from "./rslib/plugins/auto-entry-plugin.js";
// Plugins
export { AutoEntryPlugin } from "./rslib/plugins/auto-entry-plugin.js";
export type {
	ApiModelOptions,
	DtsPluginOptions,
	TsDocMetadataOptions,
	TsDocOptions,
	TsDocTagDefinition,
	TsDocTagGroup,
} from "./rslib/plugins/dts-plugin.js";
export { DtsPlugin, TsDocConfigBuilder } from "./rslib/plugins/dts-plugin.js";
export type { FilesArrayPluginOptions } from "./rslib/plugins/files-array-plugin.js";
export { FilesArrayPlugin } from "./rslib/plugins/files-array-plugin.js";
export type { PackageJsonTransformPluginOptions } from "./rslib/plugins/package-json-transform-plugin.js";
export { PackageJsonTransformPlugin } from "./rslib/plugins/package-json-transform-plugin.js";
export type {
	TsDocLintErrorBehavior,
	TsDocLintPluginOptions,
} from "./rslib/plugins/tsdoc-lint-plugin.js";
export { TsDocLintPlugin } from "./rslib/plugins/tsdoc-lint-plugin.js";

// Utilities - Import Graph Analysis
export type {
	ImportGraphError,
	ImportGraphErrorType,
	ImportGraphOptions,
	ImportGraphResult,
} from "./rslib/plugins/utils/import-graph.js";
export { ImportGraph } from "./rslib/plugins/utils/import-graph.js";

/* v8 ignore stop */
