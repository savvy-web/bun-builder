/**
 * Bun-based build system for Node.js libraries with automatic package.json transformation,
 * TypeScript declaration bundling, and multi-target support.
 *
 * @remarks
 * This package provides a powerful builder system built on top of Bun that simplifies the
 * process of building modern ESM Node.js libraries. It offers:
 *
 * - **Automatic Entry Detection**: Auto-detects entry points from package.json exports
 * - **Multi-Target Builds**: Support for dev and npm build targets
 * - **Bundled ESM Output**: Optimized single-file outputs with rolled-up types
 * - **Package.json Transformation**: Automatic path updates, Bun catalog resolution
 * - **TypeScript Declaration Bundling**: Using tsgo and API Extractor
 * - **File Array Generation**: Automatic files array creation for package.json
 * - **API Model Generation**: Optional `<packageName>.api.json` for documentation tooling
 *
 * ## Quick Start
 *
 * Create a `bun.config.ts` file in your project root:
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
 * ## Running Builds
 *
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
 * @packageDocumentation
 */

/* v8 ignore start - Export module, tested through consuming packages */

// =============================================================================
// Core Builder
// =============================================================================

export { BunLibraryBuilder } from "./builders/bun-library-builder.js";

// =============================================================================
// Builder Types
// =============================================================================

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
} from "./builders/bun-library-builder.js";

// =============================================================================
// Package.json Types
// =============================================================================

export type { PackageJson } from "./types/package-json.js";

/* v8 ignore stop */
