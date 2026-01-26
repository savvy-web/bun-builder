# @savvy-web/rslib-builder

## 0.4.0

### Minor Changes

- f4a26ef: Add TsDocLintPlugin for pre-build TSDoc comment validation

  This release introduces a new `TsDocLintPlugin` that programmatically runs ESLint
  with `eslint-plugin-tsdoc` to validate TSDoc comments before the build process
  begins. This helps catch documentation issues early in the development cycle.

  **New Features:**

  - `TsDocLintPlugin` - Standalone Rsbuild plugin for TSDoc validation
  - `tsdocLint` option in `NodeLibraryBuilder` for easy integration
  - Environment-aware defaults: throws errors in CI, logs errors locally
  - Configuration sharing between `tsdocLint` and `apiModel` options
  - Smart `tsdoc.json` persistence that avoids unnecessary file writes

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

  - `eslint`
  - `@typescript-eslint/parser`
  - `eslint-plugin-tsdoc`

  If these packages are not installed, the plugin provides a helpful error message
  explaining how to install them.

  **Improvements:**

  - `TsDocConfigBuilder.writeConfigFile()` now compares existing config files using
    deep equality to avoid unnecessary writes and uses tabs for formatting
  - Added `deep-equal` package for robust object comparison

## 0.3.0

### Minor Changes

- a5354b3: Refactor public API surface and add TSDoc validation tooling.

  **Breaking Changes:**

  - Remove `EntryExtractor`, `PackageJsonTransformer`, and `PnpmCatalog` classes from public exports (now internal implementation details)

  **New Features:**

  - Add `TsDocConfigBuilder` to public API for custom TSDoc configurations
  - Add ESLint with `eslint-plugin-tsdoc` for TSDoc syntax validation
  - Add `lint:tsdoc` npm script and lint-staged integration

  **Improvements:**

  - Convert `PackageJsonTransformer` methods to standalone functions for better testability
  - Add granular type exports (`BuildTarget`, `TransformPackageJsonFn`, option types)
  - Improve TSDoc documentation with `@public` and `@internal` tags throughout

## 0.2.2

### Patch Changes

- 4eb48b7: Unlocks @typescript/native-preview peerDependency version. We just need a newish version.

## 0.2.1

### Patch Changes

- a106f73: Fix path transformations for bin entries and nested public exports.

  **Bin entries**: TypeScript bin entries are now correctly transformed to
  `./bin/{command}.js` instead of stripping the `./src/` prefix. This matches
  RSlib's actual output structure where `"test": "./src/cli/index.ts"` compiles
  to `./bin/test.js`. Non-TypeScript entries are preserved as-is.

  **Public exports**: Paths like `./src/public/tsconfig/root.json` now correctly
  strip both `./src/` and `./public/` prefixes, resulting in `./tsconfig/root.json`
  instead of `./public/tsconfig/root.json`.

- a106f73: Fix localPaths to copy transformed package.json after build completes.

  Previously, when using `apiModel.localPaths`, the package.json was copied during
  the `pre-process` stage before transformations were applied. Now files are copied
  in `onCloseBuild` after the build completes, ensuring the transformed package.json
  (with resolved pnpm references, transformed exports, etc.) is exported.

## 0.2.0

### Minor Changes

- 9d4a183: Add TSDoc configuration support for API Extractor integration.

  - New `TsDocConfigBuilder` class for managing TSDoc configuration
  - Tag group support: core, extended, and discretionary tag categories
  - Custom tag definitions and `supportForTags` auto-derivation
  - `tsdoc.json` persistence with CI-aware defaults (persist locally, skip in CI)
  - `tsdoc-metadata.json` generation for downstream tooling
  - Prettified TSDoc warnings with file:line:column location and color output
  - Configurable warning behavior: "log", "fail", or "ignore" (defaults to "fail" in CI)

## 0.1.2

### Patch Changes

- 2c67617: Fix API model being incorrectly included in npm package. The file is now excluded via negation pattern (`!<filename>`) in the `files` array while still being emitted to dist for local tooling. Also renamed default filename to `<unscopedPackageName>.api.json` following API Extractor convention.

## 0.1.1

### Patch Changes

- 6f503aa: Fix ReDoS vulnerability in `stripSourceMapComment` regex (CWE-1333).

## 0.1.0

### Minor Changes

- ce4d70e: Initial release of RSlib Builder - a streamlined build system for modern
  ECMAScript libraries.

  Build TypeScript packages effortlessly with:

  - **Zero-config bundling** - Automatic entry point detection from package.json
  - **Rolled-up type declarations** - API Extractor integration bundles your
    .d.ts files for clean public APIs
  - **Multi-target builds** - Dev builds with source maps, optimized npm builds
  - **PNPM workspace support** - Resolves catalog: and workspace: references
  - **Self-building** - This package builds itself using NodeLibraryBuilder

  Get started with a simple config:

  ```typescript
  import { NodeLibraryBuilder } from "@savvy-web/rslib-builder";

  export default NodeLibraryBuilder.create({
    externals: ["@rslib/core"],
  });
  ```
