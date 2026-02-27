# @savvy-web/rslib-builder

## 0.6.2

### Patch Changes

* 176fd3a: Fix DTS rollup fail-fast errors, enable code splitting, and fix TSDoc config handling
  * Replace silent DTS fallback with fail-fast errors when API Extractor fails
  * Add `splitting` option (defaults to `true` for multi-entry, `false` for single-entry)
  * Build TSDoc config in-memory via `TSDocConfigFile.loadFromObject()` so custom tag definitions work in both dev and npm modes without writing to disk before the build
  * Fix tsdoc.json not persisting to project root when lint is enabled but not configured
  * Log error details when builds return `success: false`
  * Propagate original Error instances in catch sites to preserve stack traces
  * Add multi-entry splitting e2e test

## 0.6.1

### Patch Changes

* a27852b: Fix multi-target artifact copying and ImportGraph-based DTS filtering
  * Copy all build artifacts (JS, .d.ts, LICENSE, README) to additional publish target directories, not just package.json
  * Filter declaration output using ImportGraph to exclude test files (.test.d.ts, .spec.d.ts) and unreachable sources
  * Add stack trace logging when API Extractor fails for easier debugging
  * Add E2E test infrastructure with fixture-based build verification

## 0.6.0

### Minor Changes

* a894e5e: ## Dependencies
  * Upgrade ESLint from v9 to v10 for TSDoc validation. Updates eslint-plugin-tsdoc to 0.5.2 and @typescript-eslint/parser to ^8.56.0. No breaking changes to the builder API.
* d750180: ## Features

  Rename BuildTarget to BuildMode and implement publish target resolution with per-registry callback iteration.

  ### Breaking changes to public API types:

  * BuildTarget type renamed to BuildMode
  * BuildResult.target renamed to BuildResult.mode
  * TransformPackageJsonFn context changed from { target, pkg } to { mode, target, pkg } where mode is BuildMode and target is PublishTarget or undefined
  * TransformFilesContext.target renamed to .mode, with new .target for PublishTarget
  * PublishTarget interface changed: protocol is now "npm" or "jsr" (was string), registry is string or null (was string), access/provenance/tag are now required fields

  ### New exports

  * BuildMode type ("dev" or "npm")
  * PublishProtocol type ("npm" or "jsr")
  * PublishTarget interface aligned with workflow-release-action ResolvedTarget

  ### New features

  * publishConfig.targets in package.json supports shorthand strings ("npm", "github", "jsr", URLs) and full target objects
  * transform and transformFiles callbacks are invoked once per publish target when targets are configured
  * writePackageJson writes a customized package.json per publish target directory

## 0.5.0

### Minor Changes

* b5cd695: Align bun-builder API with rslib-builder conventions:
  * Add `bundle: false` bundleless mode that preserves source directory structure
  * Collect and report TSDoc warnings from API Extractor with source locations instead of suppressing them
  * Add source location info to forgotten export warnings
  * Generate tsdoc-metadata.json only for the main entry point
  * Set `enumMemberOrder: "preserve"` in API Extractor config
  * Enable `reportUnsupportedHtmlElements` in TSDoc config
  * Default `apiModel: true` and `bundle: true` via `DEFAULT_OPTIONS`
  * Load `tsdoc.json` via `TSDocConfigFile.loadForFolder()` for API Extractor

## 0.4.0

### Minor Changes

* f657efc: Align with rslib-builder featureset: add multi-entry API model merging
  with canonical reference rewriting, virtual entries for non-exported
  bundles, format option for ESM/CJS output, forgottenExports control,
  and TSDoc CI validation. Nest TSDoc lint config under apiModel.tsdoc.lint
  and default apiModel to enabled.

## 0.3.0

### Minor Changes

* 93553dd: ### Features

  * Add TSDoc linting with `eslint-plugin-tsdoc` and ImportGraph-based file discovery
  * Add TsDocConfigBuilder for generating and persisting tsdoc.json configuration
  * Add TsconfigResolver for emitting resolved tsconfig.json for documentation tools
  * Add tsdoc.json persistence to project root for IDE integration

  ### Improvements

  * Replace `glob` and `tmp` npm packages with Bun-native methods (`Bun.Glob`, `os.tmpdir()`)
  * Refactor to class-based API patterns with static methods
  * Move constants into classes as static properties (BunCatalogResolver, TsconfigResolver)
  * Add static convenience methods: `BunCatalogResolver.getDefault()`, `EntryExtractor.fromPackageJson()`
  * Reduce public API surface to only `BunLibraryBuilder` and types

  ### Documentation

  * Streamline README with links to detailed configuration docs
  * Add TypeScript configuration section explaining bundled tsconfig
  * Update design documentation to reflect current API

## 0.2.0

### Minor Changes

* 6d92bfe: Add `BUN_BUILDER_LOCAL_PATHS` environment variable support and class-based API refactoring.

  ### New Features

  * **Environment variable for local paths**: Define `BUN_BUILDER_LOCAL_PATHS` in `.env.local` or other `.env` files to specify paths for copying build artifacts without modifying the build configuration. Paths are comma-separated and merged with `apiModel.localPaths` if both are set.

  * **Class-based utility API**: Refactored all utility functions into static methods on dedicated classes for better API organization:
    * `PackageJsonTransformer` - Package.json transformation utilities
    * `FileSystemUtils` - File system operations
    * `LocalPathValidator` - Path validation for localPaths feature
    * `BuildLogger` - Logging, timing, and formatting utilities
    * `ApiModelConfigResolver` - API model configuration resolution

  ### Improvements

  * Improved test environment detection for Bun's test runner to suppress logging during tests
  * Added comprehensive TSDoc documentation with `@remarks` and `@example` blocks for all public APIs

## 0.1.1

### Patch Changes

* ce07ef5: Fix build failures and improve error diagnostics:
  * Add `bunTarget` option (default: `"bun"`) to support Bun-specific APIs like `import { $ } from "bun"`
  * Show detailed error messages from Bun.build() with file paths and line numbers instead of generic "Bundle failed"
  * Fix entry naming collisions when multiple entries have the same filename (e.g., `src/index.ts` and `src/cli/index.ts`)

## 0.1.0

### Minor Changes

* ab4be71: Initial release of @savvy-web/bun-builder - a high-performance build system for modern ESM Node.js libraries using Bun's native bundler.

  ## Features

  * **Fast Builds**: Uses Bun's native bundler for sub-second build times
  * **Automatic Entry Detection**: Extracts entry points from package.json `exports` and `bin` fields
  * **Declaration Bundling**: Generates rolled-up `.d.ts` files via tsgo + API Extractor
  * **Catalog Resolution**: Resolves Bun's `catalog:` and `workspace:` protocols for npm publishing
  * **Multi-Target Builds**: Single configuration produces both `dev` and `npm` outputs
  * **TSDoc Validation**: Optional pre-build documentation linting with eslint-plugin-tsdoc
  * **API Model Generation**: Generate API model JSON files for documentation tools
  * **Package.json Transformation**: Automatic path conversion, type declarations, and field cleanup

  ## Usage

  ```typescript
  import { BunLibraryBuilder } from "@savvy-web/bun-builder";

  export default BunLibraryBuilder.create({
    externals: ["lodash"],
    dtsBundledPackages: ["type-fest"],
    tsdocLint: true,
    apiModel: true,
  });
  ```

  Build with `bun run bun.config.ts` or target specific outputs with `--env-mode dev` or `--env-mode npm`.

## 0.4.0

### Minor Changes

* f4a26ef: Add TsDocLintPlugin for pre-build TSDoc comment validation

  This release introduces a new `TsDocLintPlugin` that programmatically runs ESLint
  with `eslint-plugin-tsdoc` to validate TSDoc comments before the build process
  begins. This helps catch documentation issues early in the development cycle.

  **New Features:**

  * `TsDocLintPlugin` - Standalone Rsbuild plugin for TSDoc validation
  * `tsdocLint` option in `NodeLibraryBuilder` for easy integration
  * Environment-aware defaults: throws errors in CI, logs errors locally
  * Configuration sharing between `tsdocLint` and `apiModel` options
  * Smart `tsdoc.json` persistence that avoids unnecessary file writes

  **Configuration Options:**

  ```typescript
  NodeLibraryBuilder.create({
    tsdocLint: {
      enabled: true, // Enable/disable linting
      onError: "throw", // 'warn' | 'error' | 'throw'
      include: ["src/**/*.ts"], // Files to lint
      persistConfig: true, // Keep tsdoc.json for IDE integration
      tsdoc: {
        // Custom TSDoc tags
        tagDefinitions: [{ tagName: "@error", syntaxKind: "block" }],
      },
    },
  });
  ```

  **Breaking Changes:** None. This is an opt-in feature.

  **Dependencies:**

  The plugin requires optional peer dependencies when enabled:

  * `eslint`
  * `@typescript-eslint/parser`
  * `eslint-plugin-tsdoc`

  If these packages are not installed, the plugin provides a helpful error message
  explaining how to install them.

  **Improvements:**

  * `TsDocConfigBuilder.writeConfigFile()` now compares existing config files using
    deep equality to avoid unnecessary writes and uses tabs for formatting
  * Added `deep-equal` package for robust object comparison

## 0.3.0

### Minor Changes

* a5354b3: Refactor public API surface and add TSDoc validation tooling.

  **Breaking Changes:**

  * Remove `EntryExtractor`, `PackageJsonTransformer`, and `PnpmCatalog` classes from public exports (now internal implementation details)

  **New Features:**

  * Add `TsDocConfigBuilder` to public API for custom TSDoc configurations
  * Add ESLint with `eslint-plugin-tsdoc` for TSDoc syntax validation
  * Add `lint:tsdoc` npm script and lint-staged integration

  **Improvements:**

  * Convert `PackageJsonTransformer` methods to standalone functions for better testability
  * Add granular type exports (`BuildTarget`, `TransformPackageJsonFn`, option types)
  * Improve TSDoc documentation with `@public` and `@internal` tags throughout

## 0.2.2

### Patch Changes

* 4eb48b7: Unlocks @typescript/native-preview peerDependency version. We just need a newish version.

## 0.2.1

### Patch Changes

* a106f73: Fix path transformations for bin entries and nested public exports.

  **Bin entries**: TypeScript bin entries are now correctly transformed to
  `./bin/{command}.js` instead of stripping the `./src/` prefix. This matches
  RSlib's actual output structure where `"test": "./src/cli/index.ts"` compiles
  to `./bin/test.js`. Non-TypeScript entries are preserved as-is.

  **Public exports**: Paths like `./src/public/tsconfig/root.json` now correctly
  strip both `./src/` and `./public/` prefixes, resulting in `./tsconfig/root.json`
  instead of `./public/tsconfig/root.json`.

* a106f73: Fix localPaths to copy transformed package.json after build completes.

  Previously, when using `apiModel.localPaths`, the package.json was copied during
  the `pre-process` stage before transformations were applied. Now files are copied
  in `onCloseBuild` after the build completes, ensuring the transformed package.json
  (with resolved pnpm references, transformed exports, etc.) is exported.

## 0.2.0

### Minor Changes

* 9d4a183: Add TSDoc configuration support for API Extractor integration.
  * New `TsDocConfigBuilder` class for managing TSDoc configuration
  * Tag group support: core, extended, and discretionary tag categories
  * Custom tag definitions and `supportForTags` auto-derivation
  * `tsdoc.json` persistence with CI-aware defaults (persist locally, skip in CI)
  * `tsdoc-metadata.json` generation for downstream tooling
  * Prettified TSDoc warnings with file:line:column location and color output
  * Configurable warning behavior: "log", "fail", or "ignore" (defaults to "fail" in CI)

## 0.1.2

### Patch Changes

* 2c67617: Fix API model being incorrectly included in npm package. The file is now excluded via negation pattern (`!<filename>`) in the `files` array while still being emitted to dist for local tooling. Also renamed default filename to `<unscopedPackageName>.api.json` following API Extractor convention.

## 0.1.1

### Patch Changes

* 6f503aa: Fix ReDoS vulnerability in `stripSourceMapComment` regex (CWE-1333).

## 0.1.0

### Minor Changes

* ce4d70e: Initial release of RSlib Builder - a streamlined build system for modern
  ECMAScript libraries.

  Build TypeScript packages effortlessly with:

  * **Zero-config bundling** - Automatic entry point detection from package.json
  * **Rolled-up type declarations** - API Extractor integration bundles your
    .d.ts files for clean public APIs
  * **Multi-target builds** - Dev builds with source maps, optimized npm builds
  * **PNPM workspace support** - Resolves catalog: and workspace: references
  * **Self-building** - This package builds itself using NodeLibraryBuilder

  Get started with a simple config:

  ```typescript
  import { NodeLibraryBuilder } from "@savvy-web/rslib-builder";

  export default NodeLibraryBuilder.create({
    externals: ["@rslib/core"],
  });
  ```
