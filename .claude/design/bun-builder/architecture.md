---
status: current
module: bun-builder
category: architecture
created: 2026-01-26
updated: 2026-02-25
last-synced: 2026-02-25
completeness: 100
related: []
dependencies: []
sync-notes: |
  Synced with feat/target-vs-mode branch changes:
  - BuildTarget type renamed to BuildMode (values still "dev" | "npm")
  - BuildResult.target renamed to BuildResult.mode
  - BuildContext.target renamed to BuildContext.mode
  - BunLibraryBuilder.DEFAULT_TARGETS renamed to DEFAULT_MODES
  - resolveTargets() renamed to resolveModes()
  - run(targets?) renamed to run(modes?), build(target) renamed to build(mode)
  - executeBuild(options, target) renamed to executeBuild(options, mode)
  - TransformPackageJsonFn context: { mode, target: PublishTarget | undefined, pkg }
  - TransformFilesContext: .mode (BuildMode) + .target (PublishTarget | undefined)
  - New PublishTarget interface for publish destination configuration
  - PublishConfig.targets field added to package-json.ts
---

# Bun Builder - Architecture

A high-performance build system for modern ESM Node.js libraries using Bun's
native bundler. Provides `BunLibraryBuilder` API for TypeScript packages with
automatic entry detection, declaration bundling, and package.json transformation.

## Table of Contents

1. [Overview](#overview)
2. [Current State](#current-state)
3. [Rationale](#rationale)
4. [System Architecture](#system-architecture)
5. [Build Lifecycle](#build-lifecycle)
6. [Data Flow](#data-flow)
7. [Configuration Reference](#configuration-reference)
8. [Integration Points](#integration-points)
9. [Testing Strategy](#testing-strategy)
10. [Future Enhancements](#future-enhancements)
11. [Related Documentation](#related-documentation)

---

## Overview

`@savvy-web/bun-builder` provides a high-level `BunLibraryBuilder` API that
simplifies building TypeScript packages using Bun's native bundler. It
handles automatic entry detection, declaration generation, package.json
transformation, and multi-mode builds.

**Key Design Principles:**

- **Native performance**: Leverage Bun's native bundler for fast builds
- **Automatic configuration**: Auto-detect entries from package.json exports
- **Multi-mode builds**: Single configuration produces dev and npm build modes
- **Publish target iteration**: `PublishTarget` type for per-registry customization
- **Multi-format output**: ESM (default) or CJS via `format` option
- **Bundleless mode**: `bundle: false` preserves source structure with individual file compilation
- **Multi-entry declarations**: Per-entry API Extractor with merged API models
- **Declaration bundling**: tsgo + API Extractor for rolled-up .d.ts files
- **Catalog resolution**: Support for Bun's `catalog:` and `workspace:` protocols
- **Virtual entries**: Bundle non-exported files (e.g., pnpmfile.cjs) without types
- **Self-building**: The package builds itself using BunLibraryBuilder
- **Minimal API surface**: Public exports limited to `BunLibraryBuilder` and types;
  utility classes are internal implementation details

**When to reference this document:**

- When understanding the build pipeline phases
- When modifying build lifecycle hooks
- When debugging build output issues
- When extending the builder with new options
- When understanding catalog/workspace resolution

---

## Current State

### System Components

#### Component 1: BunLibraryBuilder

**Location:** `src/builders/bun-library-builder.ts`

**Purpose:** Main public API providing a fluent interface for building Node.js
libraries with Bun.

**Responsibilities:**

- Parse and validate build options
- Detect build mode from `--env-mode` CLI argument
- Orchestrate build lifecycle for each mode
- Inject package version at compile time via Bun macro
- Report build results and timing

**Key interfaces/APIs:**

```typescript
class BunLibraryBuilder {
  // Default options applied to all builds
  static readonly DEFAULT_OPTIONS: Partial<BunLibraryBuilderOptions> = {
    apiModel: true,
    bundle: true,
  };

  // Factory method - recommended entry point
  static async create(options?: BunLibraryBuilderOptions): Promise<BuildResult[]>

  // Instance methods
  constructor(options?: BunLibraryBuilderOptions)
  async run(modes?: BuildMode[]): Promise<BuildResult[]>
  async build(mode: BuildMode): Promise<BuildResult>
}

type BuildMode = "dev" | "npm";
```

The `DEFAULT_OPTIONS` static property is merged with user-provided options in the
constructor: `{ ...BunLibraryBuilder.DEFAULT_OPTIONS, ...options }`. This means
API model generation and bundled output mode are enabled by default unless the
user explicitly overrides them.

**Dependencies:**

- Depends on: Build lifecycle hooks, logger utilities, version macro
- Used by: Consumer `bun.config.ts` files

#### Component 2: Build Lifecycle

**Location:** `src/hooks/build-lifecycle.ts`

**Purpose:** Core build orchestration implementing all build phases.

**Key Functions:**

| Function | Purpose |
| --- | --- |
| `executeBuild()` | Main orchestrator running all phases |
| `runTsDocLint()` | Pre-build TSDoc validation |
| `runBunBuild()` | Execute Bun.build() bundling (bundle mode) |
| `runBundlessBuild()` | Individual file compilation (bundleless mode) |
| `runTsgoGeneration()` | Generate .d.ts with tsgo |
| `runApiExtractor()` | Per-entry declaration bundling with API Extractor |
| `mergeApiModels()` | Merge per-entry API models with canonical reference rewriting |
| `writePackageJson()` | Transform and write package.json |
| `copyFiles()` | Copy additional assets to output |

**Build Context Interface:**

```typescript
interface BuildContext {
  cwd: string;                          // Project root
  mode: BuildMode;                      // "dev" or "npm"
  options: BunLibraryBuilderOptions;
  outdir: string;                       // e.g., "dist/npm"
  entries: Record<string, string>;      // Entry name -> source path
  exportPaths: Record<string, string>;  // Entry name -> original export key
  version: string;                      // Package version
  packageJson: PackageJson;             // Original package.json
}
```

#### Component 3: Entry Extractor

**Location:** `src/plugins/utils/entry-extractor.ts`

**Purpose:** Extract TypeScript entry points from package.json exports and bin
fields.

**Key Features:**

- Parse `exports` field (string, object, conditional exports)
- Parse `bin` field (string or object)
- Map JavaScript output paths back to TypeScript sources
- Support `exportsAsIndexes` option for directory structure
- Static `fromPackageJson()` method for convenient one-liner extraction

```typescript
class EntryExtractor {
  constructor(options?: EntryExtractorOptions)
  extract(packageJson: PackageJson): ExtractedEntries

  // Static convenience method
  static fromPackageJson(packageJson: PackageJson, options?: EntryExtractorOptions): ExtractedEntries
}

interface ExtractedEntries {
  entries: Record<string, string>;      // "index" -> "./src/index.ts"
  exportPaths: Record<string, string>;  // "index" -> ".", "utils" -> "./utils"
}
```

The `exportPaths` field maps entry names back to their original package.json export
keys. This is used by the multi-entry API model merging to determine canonical
reference prefixes for sub-entries (e.g., `@scope/package/utils!`).

#### Component 4: Catalog Resolver

**Location:** `src/plugins/utils/catalog-resolver.ts`

**Purpose:** Resolve Bun's `catalog:` and `workspace:` dependency protocols.

**Key Features:**

- Find workspace root by traversing directory tree
- Cache catalog data with mtime-based invalidation
- Resolve `catalog:` references to default catalog
- Resolve `catalog:<name>` references to named catalogs
- Resolve `workspace:*` references to package versions
- Validate no unresolved references remain
- Static `getDefault()` method for shared singleton instance
- Constants as static class properties (`CATALOG_PREFIX`, `WORKSPACE_PREFIX`)

```typescript
class BunCatalogResolver {
  // Static singleton access
  static getDefault(): BunCatalogResolver

  // Instance methods
  clearCache(): void
  findWorkspaceRoot(startDir?: string): string | null
  async getCatalogs(workspaceRoot?: string): Promise<CatalogData>
  async resolveReference(ref: string, packageName: string): Promise<string | null>
  async resolvePackageJson(pkg: PackageJson, dir?: string): Promise<PackageJson>
}
```

**Catalog Format (workspace root package.json):**

```json
{
  "workspaces": {
    "packages": ["packages/*"],
    "catalog": {
      "react": "^19.0.0"
    },
    "catalogs": {
      "testing": {
        "vitest": "^4.0.0"
      }
    }
  }
}
```

#### Component 5: PackageJsonTransformer

**Location:** `src/plugins/utils/package-json-transformer.ts`

**Purpose:** Transform package.json for build output with path updates and
catalog resolution. All methods are static on the `PackageJsonTransformer` class.

**Key Methods:**

| Method | Purpose |
| --- | --- |
| `PackageJsonTransformer.transformExportPath()` | Strip src/ prefix, convert .ts to .js |
| `PackageJsonTransformer.createTypePath()` | Create .d.ts path from .js path |
| `PackageJsonTransformer.transformBin()` | Transform bin field paths |
| `PackageJsonTransformer.transformExports()` | Recursively transform exports field |
| `PackageJsonTransformer.applyBuildTransformations()` | Apply all RSlib-style transformations |
| `PackageJsonTransformer.resolveCatalogReferences()` | Resolve catalog: and workspace: refs |
| `PackageJsonTransformer.build()` | Complete transformation pipeline |

```typescript
import { PackageJsonTransformer } from '@savvy-web/bun-builder';

// Transform a single path
const jsPath = PackageJsonTransformer.transformExportPath('./src/index.ts');
// Returns: "./index.js"

// Complete package.json transformation
const transformed = await PackageJsonTransformer.build(pkg, {
  isProduction: true,
  processTSExports: true,
  bundle: true,
});
```

#### Component 6: TSConfig System

**Location:** `src/tsconfig/index.ts`

**Purpose:** Manage TypeScript configuration files for declaration generation.

**Key Features:**

- Provide base tsconfig templates for library builds
- Generate bundle-mode configurations with transformed paths
- Write temporary tsconfig files for tsgo

```typescript
class LibraryTSConfigFile extends TSConfigFile {
  bundle(target: "dev" | "npm"): TSConfigJsonWithSchema
  writeBundleTempConfig(target: "dev" | "npm"): string  // Returns temp file path
}

const TSConfigs = {
  node: {
    ecma: {
      lib: LibraryTSConfigFile  // For Node.js ESM libraries
    }
  }
}
```

#### Component 7: Version Macro

**Location:** `src/macros/version.ts`

**Purpose:** Embed package version at compile time using Bun macros.

```typescript
// Imported with macro type annotation
import { getVersion } from "../macros/version.ts" with { type: "macro" };

const PACKAGE_VERSION: string = getVersion();
```

The macro reads `package.json` during bundling and embeds the version string
directly into the output, avoiding runtime file reads.

#### Component 8: BuildLogger

**Location:** `src/plugins/utils/logger.ts`

**Purpose:** RSlib-style logging with colored output and environment awareness.
All methods are static on the `BuildLogger` class.

**Key Methods:**

| Method | Purpose |
| --- | --- |
| `BuildLogger.isCI()` | Check if running in CI environment |
| `BuildLogger.isTestEnvironment()` | Check if running in test environment |
| `BuildLogger.formatTime()` | Format milliseconds to human-readable |
| `BuildLogger.formatSize()` | Format bytes to human-readable |
| `BuildLogger.createTimer()` | Create timer for performance measurement |
| `BuildLogger.createLogger()` | Create logger with bracketed prefix |
| `BuildLogger.createEnvLogger()` | Create environment-aware logger |
| `BuildLogger.collectFileInfo()` | Collect file sizes for file table |
| `BuildLogger.printBanner()` | Print version banner |
| `BuildLogger.printFileTable()` | Print RSlib-style file table |
| `BuildLogger.printSummary()` | Print build completion summary |

```typescript
import { BuildLogger } from '@savvy-web/bun-builder';

// Basic logger with bracketed prefix
const logger = BuildLogger.createLogger("tsdoc-lint");
logger.info("Validating...");  // info    [tsdoc-lint] Validating...

// Environment-aware logger with mode context
const envLogger = BuildLogger.createEnvLogger("npm");
envLogger.info("Building...");  // info    [npm] Building...
envLogger.global.info("Global");  // info    Global

// Timer and formatting
const timer = BuildLogger.createTimer();
// ... operation
console.log(BuildLogger.formatTime(timer.elapsed())); // "150ms" or "2.50 s"
```

#### Component 9: FileSystemUtils

**Location:** `src/plugins/utils/file-utils.ts`

**Purpose:** File system utilities for build operations. All methods are static
on the `FileSystemUtils` class.

**Key Methods:**

| Method | Purpose |
| --- | --- |
| `FileSystemUtils.fileExistsAsync()` | Check if file exists (async) |
| `FileSystemUtils.packageJsonVersion()` | Read package version |
| `FileSystemUtils.findWorkspaceRoot()` | Find monorepo workspace root |
| `FileSystemUtils.getApiExtractorPath()` | Get API Extractor package path |
| `FileSystemUtils.getTsgoBinPath()` | Get tsgo binary path |
| `FileSystemUtils.getUnscopedPackageName()` | Strip @scope/ from package name |

```typescript
import { FileSystemUtils } from '@savvy-web/bun-builder';

const version = await FileSystemUtils.packageJsonVersion();
const root = FileSystemUtils.findWorkspaceRoot();
const tsgoBin = FileSystemUtils.getTsgoBinPath();
```

#### Component 10: LocalPathValidator

**Location:** `src/plugins/utils/file-utils.ts`

**Purpose:** Validates local paths for the `apiModel.localPaths` feature. Ensures
that destination directories exist before attempting to copy build artifacts.

**Key Methods:**

| Method | Purpose |
| --- | --- |
| `LocalPathValidator.validatePaths()` | Validate all paths, throw on invalid |
| `LocalPathValidator.isValidPath()` | Check single path, return boolean |

```typescript
import { LocalPathValidator } from '@savvy-web/bun-builder';

// Validate paths before copying (throws on error)
LocalPathValidator.validatePaths(process.cwd(), ['../docs/api', './output']);

// Check a single path
if (LocalPathValidator.isValidPath(process.cwd(), '../docs/api')) {
  console.log('Path is valid');
}
```

#### Component 11: ApiModelConfigResolver

**Location:** `src/hooks/build-lifecycle.ts`

**Purpose:** Resolves `ApiModelOptions` from builder configuration into concrete
configuration values with all defaults applied.

**Key Methods:**

| Method | Purpose |
| --- | --- |
| `ApiModelConfigResolver.resolve()` | Resolve options into full config object |

**Default Behavior:** When `apiModel` is `undefined` (not specified), the resolver
returns `enabled: true`. This means API model generation is on by default for npm
builds. Pass `apiModel: false` to explicitly disable it.

```typescript
import { ApiModelConfigResolver } from '@savvy-web/bun-builder';

const config = ApiModelConfigResolver.resolve(undefined, 'my-package');
// Returns: { enabled: true, filename: 'my-package.api.json', ... }

const config2 = ApiModelConfigResolver.resolve(false, 'my-package');
// Returns: { enabled: false, ... }
```

#### Component 12: LocalPathCopier

**Location:** `src/hooks/build-lifecycle.ts`

**Purpose:** Copies build artifacts (API model, tsdoc-metadata.json, tsconfig.json,
tsdoc.json, package.json) to specified local directories after build completion.

```typescript
import { LocalPathCopier } from '@savvy-web/bun-builder';

const copier = new LocalPathCopier(context, {
  apiModelFilename: 'my-package.api.json',
  tsdocMetadataFilename: 'tsdoc-metadata.json',
  tsconfigFilename: 'tsconfig.json',
  tsdocConfigFilename: 'tsdoc.json',
});

await copier.copyToLocalPaths(['../docs/api', './site/api']);
```

#### Component 13: TsconfigResolver

**Location:** `src/plugins/utils/tsconfig-resolver.ts`

**Purpose:** Converts TypeScript's internal `ParsedCommandLine` representation
to a JSON-serializable tsconfig format for virtual TypeScript environments.

**Key Features:**

- Converts enum values (target, module, jsx, etc.) to their string equivalents
- Sets `composite: false` and `noEmit: true` for virtual environment compatibility
- Excludes path-dependent options (rootDir, outDir, baseUrl, paths, typeRoots)
- Excludes file selection (include, exclude, files, references)
- Converts lib references from full paths to short names (e.g., "esnext")
- Adds `$schema` for IDE support

**Static Conversion Methods:**

| Method | Purpose |
| --- | --- |
| `convertScriptTarget()` | Convert ScriptTarget enum to string |
| `convertModuleKind()` | Convert ModuleKind enum to string |
| `convertModuleResolution()` | Convert ModuleResolutionKind enum to string |
| `convertJsxEmit()` | Convert JsxEmit enum to string |
| `convertModuleDetection()` | Convert ModuleDetectionKind enum to string |
| `convertNewLine()` | Convert NewLineKind enum to string |
| `convertLibReference()` | Convert lib.*.d.ts to short name |

**Instance Method:**

| Method | Purpose |
| --- | --- |
| `resolve(parsed, rootDir)` | Transform ParsedCommandLine to ResolvedTsconfig |

```typescript
import { parseJsonConfigFileContent, readConfigFile, sys } from 'typescript';
import { TsconfigResolver } from '@savvy-web/bun-builder';

const configFile = readConfigFile('tsconfig.json', sys.readFile.bind(sys));
const parsed = parseJsonConfigFileContent(configFile.config, sys, process.cwd());

const resolver = new TsconfigResolver();
const resolved = resolver.resolve(parsed, process.cwd());
console.log(JSON.stringify(resolved, null, 2));
```

#### Component 14: TsDocConfigBuilder

**Location:** `src/plugins/utils/tsdoc-config-builder.ts`

**Purpose:** Dynamically generates `tsdoc.json` configuration files for API
Extractor and documentation tools based on tag group selections.

**Key Features:**

- Expands tag groups into individual tag definitions from `@microsoft/tsdoc`
- Supports three standardization groups: core, extended, discretionary
- Generates properly formatted tsdoc.json with `$schema` and `supportForTags`
- Sets `reportUnsupportedHtmlElements: true` in generated config
- Optimizes output based on group selection (minimal config for all groups)
- Handles config persistence based on environment (CI vs local)
- Supports custom tag definitions beyond standard groups

**Static Methods:**

| Method | Purpose |
| --- | --- |
| `build(options)` | Build tag config from options |
| `buildConfigObject(options)` | Build serializable tsdoc.json config object |
| `validateConfigFile(options, path)` | Validate existing tsdoc.json matches expected config |
| `writeConfigFile(options, dir)` | Write tsdoc.json (or validate in CI) |
| `getTagsForGroup(group)` | Get standard tags for a group |
| `isCI()` | Detect CI environment |
| `shouldPersist(config)` | Determine if config should persist to disk |
| `getConfigPath(config, cwd)` | Resolve output path for tsdoc.json |

**Static Properties:**

| Property | Purpose |
| --- | --- |
| `ALL_GROUPS` | Array of all group names |
| `TAG_GROUPS` | Lazily computed tag definitions per group |

**CI Validation Behavior:**

In CI environments, `writeConfigFile()` validates the existing `tsdoc.json` instead
of writing it. If the file is missing or out of date, it throws an error prompting
the developer to regenerate locally and commit. This ensures committed configs stay
in sync with build options without CI modifying tracked files.

```typescript
import { TsDocConfigBuilder } from '@savvy-web/bun-builder';

// Build config for all standard tags
const config = TsDocConfigBuilder.build();
// { tagDefinitions: [], supportForTags: {...}, useStandardTags: true }

// Build serializable config object (no file I/O)
const configObj = TsDocConfigBuilder.buildConfigObject({ groups: ['core'] });

// Write to output directory (validates in CI instead of writing)
await TsDocConfigBuilder.writeConfigFile({}, './dist/npm');

// Explicitly validate against expected config
await TsDocConfigBuilder.validateConfigFile({}, './tsdoc.json');
```

#### Component 15: ImportGraph

**Location:** `src/plugins/utils/import-graph.ts`

**Purpose:** Analyzes TypeScript import relationships to discover all files
reachable from specified entry points. Used by TSDoc linting for file discovery
and by bundleless mode (`runBundlessBuild()`) to discover all source files that
need individual compilation.

**Key Features:**

- Uses TypeScript compiler API for accurate module resolution
- Supports path aliases from tsconfig.json
- Handles static imports, dynamic imports, and re-exports
- Tracks circular imports via visited set
- Filters out test files, declaration files, and node_modules

**Static Methods:**

| Method | Purpose |
| --- | --- |
| `fromEntries(paths, opts)` | Trace imports from entry file paths |
| `fromPackageExports(path)` | Trace imports from package.json exports |

**Instance Methods:**

| Method | Purpose |
| --- | --- |
| `traceFromEntries(entryPaths)` | Trace imports from entry file paths |
| `traceFromPackageExports(path)` | Trace imports from package.json exports |

```typescript
// Internal usage example (not part of public API)
import { ImportGraph } from '../plugins/utils/import-graph.js';

// Discover all files from package.json exports
const graph = new ImportGraph({ rootDir: process.cwd() });
const result = graph.traceFromPackageExports('package.json');

console.log(result.files);    // All reachable TypeScript files
console.log(result.entries);  // Entry points that were traced
console.log(result.errors);   // Any errors encountered

// Or use static methods
const result2 = ImportGraph.fromEntries(['./src/index.ts'], { rootDir: process.cwd() });
```

### Architecture Diagram

```text
+-------------------------------------------------------------+
|                    User API Layer                           |
|           BunLibraryBuilder.create(options)                 |
|                                                             |
|    High-level fluent interface hiding Bun.build complexity  |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|              Mode Resolution Layer                          |
|    - Parse --env-mode from CLI                              |
|    - Use options.targets or default to ["dev", "npm"]       |
|    - Sequential mode execution                              |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|              Build Lifecycle Orchestration                  |
|    executeBuild(options, mode)                              |
|                                                             |
|    1. Setup (read pkg, extract entries+exportPaths)         |
|    2. Validate local paths (early fail-fast)                |
|    3. TSDoc Lint (from apiModel.tsdoc.lint)                 |
|    4a. Bun.build() bundled (bundle!=false)                  |
|    4b. Bun.build() bundleless (bundle=false, per-file)     |
|    5. tsgo (generate declarations)                          |
|    6a. API Extractor DTS rollup (bundle mode)               |
|    6b. Copy raw .d.ts + API Extractor model (bundleless)   |
|    7. Copy files (README, LICENSE, assets)                  |
|    8. Transform files (user callback)                       |
|    9. Virtual entries (bundle non-exported files)            |
|   10. Write package.json (with files array)                 |
|   11. Copy to local paths (npm mode, non-CI only)           |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|              Utility Classes Layer                          |
|    - EntryExtractor: Parse exports/bin, return exportPaths  |
|    - BunCatalogResolver: Resolve catalog:/workspace:        |
|    - PackageJsonTransformer: Path transformations (static)  |
|    - FileSystemUtils: File ops, paths, versions (static)    |
|    - LocalPathValidator: Validate destination paths (static)|
|    - BuildLogger: RSlib-style colored output (static)       |
|    - ApiModelConfigResolver: Resolve API model config       |
|    - LocalPathCopier: Copy artifacts to local paths         |
|    - TsconfigResolver: Resolve tsconfig for virtual envs    |
|    - TsDocConfigBuilder: Generate/validate tsdoc.json       |
|    - ImportGraph: Trace imports for lint + bundleless mode  |
|    - TSConfigs: Manage tsconfig for declaration gen         |
|    - mergeApiModels(): Merge per-entry API model JSON       |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|              External Tools Layer                           |
|    - Bun.build(): Native bundler (ESM or CJS)              |
|    - tsgo: Fast TypeScript declaration generation           |
|    - API Extractor: Per-entry declaration bundling + model  |
+-------------------------------------------------------------+
```

### Build Modes

Two build modes with different optimizations:

| Mode | Source Maps | Minify | API Model | Output Directory | Private |
| --- | --- | --- | --- | --- | --- |
| `dev` | linked | false | false | `dist/dev/` | true |
| `npm` | none | false | true* | `dist/npm/` | false** |

*API model enabled by default when `apiModel` is undefined (set `false` to disable)
**Based on `publishConfig.access` in source package.json

Modes selected via `--env-mode`:

```bash
bun run bun.config.ts --env-mode dev
bun run bun.config.ts --env-mode npm
bun run bun.config.ts  # Builds both
```

### Publish Targets

The `PublishTarget` type represents a single publish destination (e.g., npm
registry, GitHub Packages). Publish targets are resolved from
`publishConfig.targets` in package.json and passed to transform callbacks,
enabling per-registry package.json customization.

```typescript
interface PublishTarget {
  protocol: string;      // e.g., "https"
  registry: string;      // e.g., "https://registry.npmjs.org/"
  directory: string;     // Output directory for this target
  access?: "public" | "restricted";
  provenance?: boolean;
  [key: string]: unknown;
}
```

The `TransformPackageJsonFn` and `TransformFilesContext` receive the current
`PublishTarget` (or `undefined` when no targets are configured). Currently
`target` is passed as `undefined` in the build lifecycle; full publish target
iteration is a planned future enhancement.

### Current Limitations

- **Sequential mode builds**: Modes are built one at a time
- **No watch mode**: Full rebuild required on changes
- **Workspace resolution limited**: Only checks `packages/<name>` paths
- **Bundleless mode limitations**: No tree shaking in bundleless mode; all
  reachable files from entry points are compiled and included in output

---

## Rationale

### Architectural Decisions

#### Decision 1: Bun Native Bundler

**Context:** Need fast, reliable bundling for TypeScript libraries.

**Options considered:**

1. **Bun.build() (Chosen):**
   - Pros: Native speed, first-class TypeScript support, built-in tree shaking
   - Cons: Less mature ecosystem, fewer plugins than webpack/rollup
   - Why chosen: Performance critical, excellent TypeScript support

2. **RSlib/Rspack:**
   - Pros: Rich plugin ecosystem, battle-tested
   - Cons: Heavier dependency footprint, slower builds
   - Why rejected: Bun provides sufficient features with better performance

3. **esbuild:**
   - Pros: Very fast, mature
   - Cons: Limited TypeScript declaration support
   - Why rejected: Bun integrates bundling natively

#### Decision 2: tsgo for Declaration Generation

**Context:** Need fast TypeScript declaration generation.

**Options considered:**

1. **tsgo native compiler (Chosen):**
   - Pros: 10-100x faster than tsc, native execution
   - Cons: Experimental, may have edge cases
   - Why chosen: Performance critical for developer experience

2. **Standard tsc:**
   - Pros: Battle-tested, full compatibility
   - Cons: Slow for large projects
   - Why rejected: Build times unacceptable for iteration speed

3. **Bun's built-in declaration generation:**
   - Pros: No external dependency
   - Cons: Not yet available in stable Bun
   - Why rejected: Feature not available

#### Decision 3: API Extractor for Declaration Bundling

**Context:** Need to bundle TypeScript declarations for cleaner public API.

**Options considered:**

1. **@microsoft/api-extractor (Chosen):**
   - Pros: Industry standard, generates API reports, bundles declarations
   - Cons: Can be slow, requires careful configuration
   - Why chosen: Best-in-class API documentation and declaration bundling

2. **dts-bundle-generator:**
   - Pros: Simpler, faster
   - Cons: Less comprehensive, no API reports
   - Why rejected: Need API model generation for documentation tooling

3. **No bundling (raw .d.ts files):**
   - Pros: Simplest
   - Cons: Cluttered API, harder for consumers
   - Why rejected: Want clean single-file declarations

#### Decision 4: Sequential Build Lifecycle

**Context:** Need predictable build phase execution.

**Options considered:**

1. **Sequential phases (Chosen):**
   - Pros: Predictable, debuggable, clear dependencies
   - Cons: Cannot parallelize independent operations
   - Why chosen: Simplicity and reliability over minor performance gains

2. **Parallel phases where possible:**
   - Pros: Potentially faster
   - Cons: Complex dependency management, harder to debug
   - Why rejected: Build times already fast enough with Bun

#### Decision 5: Bun Catalog Protocol Support

**Context:** Need to support Bun workspace dependency catalogs for monorepo
version management.

**Options considered:**

1. **Full catalog resolution (Chosen):**
   - Pros: Seamless monorepo support, consistent dependency versions
   - Cons: Additional complexity, workspace detection overhead
   - Why chosen: Essential for monorepo workflows

2. **Require resolved versions:**
   - Pros: Simpler implementation
   - Cons: Poor DX for monorepos
   - Why rejected: Catalogs are core Bun workspace feature

#### Decision 6: Environment-Aware Error Handling

**Context:** TSDoc errors should fail CI but not block local development.

**Options considered:**

1. **Auto-detect CI with configurable override (Chosen):**
   - Pros: Sensible defaults, flexible configuration
   - Cons: Implicit behavior based on environment
   - Why chosen: Matches developer expectations

2. **Always throw:**
   - Pros: Consistent behavior
   - Cons: Blocks local iteration
   - Why rejected: Too disruptive for development

### Design Patterns Used

#### Pattern 1: Factory Method

- **Where used:** `BunLibraryBuilder.create()`
- **Why used:** Combine instantiation and execution, return results directly
- **Implementation:** Static async method returns `Promise<BuildResult[]>`

#### Pattern 2: Pipeline

- **Where used:** Build lifecycle phases
- **Why used:** Clear sequential processing with defined stages
- **Implementation:** `executeBuild()` calls phase functions in order

#### Pattern 3: Singleton with Caching

- **Where used:** `BunCatalogResolver`
- **Why used:** Avoid repeated filesystem operations for catalog resolution
- **Implementation:** Module-level singleton with mtime-based cache invalidation

#### Pattern 4: Strategy

- **Where used:** Mode-specific build configuration
- **Why used:** Different settings for dev vs npm builds
- **Implementation:** Conditional logic in `executeBuild()` based on mode

### Constraints and Trade-offs

#### Trade-off 1: Simplicity vs. Flexibility

- **What we gained:** Simple API for common use cases
- **What we sacrificed:** Advanced plugin extensibility
- **Why it's worth it:** 90% of builds need standard patterns

#### Trade-off 2: Performance vs. Compatibility

- **What we gained:** Fast builds with Bun and tsgo
- **What we sacrificed:** Some edge case compatibility
- **Why it's worth it:** Developer iteration speed is critical

---

## System Architecture

### Layered Architecture

#### Layer 1: User API

**Responsibilities:**

- Accept user configuration options
- Validate inputs
- Return build results

**Components:**

- BunLibraryBuilder class
- Type definitions for options

**Communication:** Returns `Promise<BuildResult[]>`

#### Layer 2: Build Orchestration

**Responsibilities:**

- Resolve build modes from CLI or options
- Execute build lifecycle for each mode
- Aggregate and report results

**Components:**

- `BunLibraryBuilder.run()`
- `executeBuild()`

**Communication:** Sequential mode execution

#### Layer 3: Build Phases

**Responsibilities:**

- Execute individual build phases
- Transform source to output
- Generate declarations

**Components:**

- Phase functions in build-lifecycle.ts
- TSConfig system for declaration config

**Communication:** Phase functions receive/return BuildContext

#### Layer 4: Utilities

**Responsibilities:**

- Entry extraction from package.json
- Catalog/workspace resolution
- Package.json transformation
- Logging and formatting

**Components:**

- EntryExtractor
- BunCatalogResolver
- Package.json transformer functions
- Logger utilities

**Communication:** Pure functions and stateless utilities

### Directory Structure

```text
bun-builder/
├── src/
│   ├── index.ts                 # Main exports (BunLibraryBuilder + types only)
│   ├── builders/
│   │   └── bun-library-builder.ts  # Main builder class
│   ├── hooks/
│   │   └── build-lifecycle.ts   # Build phase implementations
│   │                            # - ApiModelConfigResolver class
│   │                            # - LocalPathCopier class
│   │                            # - executeBuild() orchestration
│   ├── plugins/
│   │   └── utils/
│   │       ├── entry-extractor.ts        # EntryExtractor class
│   │       │                             # (static fromPackageJson())
│   │       ├── catalog-resolver.ts       # BunCatalogResolver class
│   │       │                             # (static getDefault())
│   │       ├── package-json-transformer.ts # PackageJsonTransformer (static)
│   │       ├── tsconfig-resolver.ts      # TsconfigResolver class
│   │       ├── tsdoc-config-builder.ts   # TsDocConfigBuilder (static)
│   │       ├── import-graph.ts           # ImportGraph class for TSDoc lint
│   │       │                             # (static fromEntries/fromPackageExports)
│   │       ├── file-utils.ts             # FileSystemUtils (static)
│   │       │                             # LocalPathValidator (static)
│   │       └── logger.ts                 # BuildLogger (static)
│   ├── macros/
│   │   └── version.ts           # Compile-time version macro
│   ├── tsconfig/
│   │   └── index.ts             # TSConfig management
│   ├── public/
│   │   └── tsconfig/            # Base tsconfig JSON files
│   └── types/
│       ├── builder-types.ts     # Builder option types
│       ├── package-json.ts      # PackageJson type
│       └── tsconfig-json.d.ts   # TSConfig types
├── bun.config.ts                # Self-builds using BunLibraryBuilder
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Build Lifecycle

### Phase Diagram

```text
executeBuild(options, mode)
         |
         v
+----------------------------------------+
| 1. SETUP                               |
|    - Read package.json                 |
|    - Extract version                   |
|    - Extract entries + exportPaths     |
|    - Log auto-detected entries         |
+----------------------------------------+
         |
         v
+----------------------------------------+
| 2. VALIDATE LOCAL PATHS (npm only)     |
|    - Skip in CI environments           |
|    - Use LocalPathValidator            |
|    - Fail fast before expensive builds |
+----------------------------------------+
         |
         v
+----------------------------------------+
| 3. CLEAN & CREATE OUTPUT               |
|    - Remove existing output directory  |
|    - Create fresh output directory     |
+----------------------------------------+
         |
         v
+----------------------------------------+
| 4. TSDOC LINT (from apiModel.tsdoc)    |
|    - Skip if apiModel=false or         |
|      tsdoc.lint=false                  |
|    - Shares tsdoc config with API model|
|    - Generate/validate tsdoc.json      |
|    - Dynamic import ESLint + plugins   |
|    - Use ImportGraph for file discovery|
|    - Lint discovered files             |
|    - Handle errors based on onError    |
|    - Optionally persist tsdoc.json     |
+----------------------------------------+
         |
         v
+----------------------------------------+
| 5. BUN BUILD (bundle mode branching)   |
|    IF bundle != false (default):       |
|    - Convert entries to absolute paths |
|    - format: esm (default) or cjs     |
|    - target: bun (default), node, or  |
|      browser via bunTarget option      |
|    - Execute bundling                  |
|    - Rename outputs to match entries   |
|    IF bundle = false (bundleless):     |
|    - ImportGraph.traceFromEntries()    |
|    - Discover all reachable source     |
|    - Bun.build() per discovered file   |
|    - Strip src/ prefix from outputs    |
|    - Preserve source directory layout  |
|    - Track outputs for files array     |
+----------------------------------------+
         |
         v
+----------------------------------------+
| 6. DECLARATION GENERATION              |
|    - Create temp declaration directory |
|    - Remove stale .tsbuildinfo files   |
|    - Generate temp tsconfig            |
|    - Run tsgo --declaration            |
+----------------------------------------+
         |
         v
+----------------------------------------+
| 7. DECLARATION BUNDLING (multi-entry)  |
|    - Validate API Extractor installed  |
|    - Load TSDocConfigFile.loadForFolder|
|    - Loop over ALL export entries      |
|    - Run API Extractor per entry       |
|    - enumMemberOrder: "preserve"       |
|    - Bundle per-entry .d.ts files      |
|      (or skip DTS rollup if bundleless)|
|    - Collect per-entry API models      |
|    - Collect TSDoc warnings w/ source  |
|    - Collect forgotten exports w/ src  |
|    - Merge models via mergeApiModels() |
|    - Rewrite canonical refs for subs   |
|    - Process TSDoc warnings (fail/log) |
|    - Handle forgottenExports option    |
|    - tsdoc-metadata: main entry only   |
|    - Generate tsconfig.json + tsdoc.json|
|    - Fallback: copy unbundled .d.ts    |
+----------------------------------------+
         |
         v
+----------------------------------------+
| 8. COPY FILES                          |
|    - Auto-add public/ directory        |
|    - Auto-add README.md, LICENSE       |
|    - Process copyPatterns option       |
|    - Track copied files                |
+----------------------------------------+
         |
         v
+----------------------------------------+
| 9. TRANSFORM FILES (optional)          |
|    - Call transformFiles callback      |
|    - Allow user post-processing        |
|    - Modify files array if needed      |
+----------------------------------------+
         |
         v
+----------------------------------------+
| 10. VIRTUAL ENTRIES (optional)         |
|    - Group by format (esm/cjs)        |
|    - Bun.build() per format group     |
|    - Rename to match output names     |
|    - Skip type generation             |
|    - Add to files array               |
+----------------------------------------+
         |
         v
+----------------------------------------+
| 11. WRITE PACKAGE.JSON                 |
|    - Resolve catalog references (npm)  |
|    - Transform export paths            |
|    - Apply format option to transform  |
|    - Apply user transform function     |
|    - Set private flag for dev          |
|    - Add files array                   |
|    - Write to output directory         |
+----------------------------------------+
         |
         v
+----------------------------------------+
| 12. COPY TO LOCAL PATHS (npm only)     |
|    - Skip in CI environments           |
|    - Use LocalPathCopier               |
|    - Copy API model, tsdoc-metadata    |
|    - Copy tsconfig.json, tsdoc.json    |
|    - Copy package.json                 |
+----------------------------------------+
         |
         v
    Return BuildResult
```

### Phase Details

#### Phase 1: Setup

**Inputs:**

- `options`: BunLibraryBuilderOptions
- `mode`: "dev" | "npm"

**Operations:**

1. Read `package.json` from project root
2. Read package version
3. Create `EntryExtractor` with options
4. Extract entries from exports/bin fields
5. Validate at least one entry found
6. Log detected entries
7. Log tsconfig being used
8. Create `BuildContext` object
9. Clean and create output directory

**Outputs:**

- `BuildContext` with all necessary data

#### Phase 2: TSDoc Lint

**Configuration Path:** `apiModel.tsdoc.lint`

TSDoc lint is now configured as a nested property of `apiModel.tsdoc`, not as a
top-level option. This means lint shares the same TSDoc tag configuration (groups,
tagDefinitions, supportForTags) as API Extractor, so tags are defined once.

**Inputs:**

- `BuildContext`
- `TsDocLintOptions` (from `options.apiModel.tsdoc.lint`)
- Shared `TsDocOptions` (from `options.apiModel.tsdoc`, excluding `lint`)

**Enablement Logic:**

- Lint runs if `apiModel !== false` and `tsdoc.lint !== false`
- Lint is skipped if `apiModel` is `false` or `tsdoc.lint` is explicitly `false`
- When `apiModel` is `true` or `undefined`, lint is enabled if `tsdoc.lint` is set

**Operations:**

1. Extract shared TSDoc config (groups, tags) from `apiModel.tsdoc`
2. Merge with lint-specific options (include, onError)
3. Generate/validate tsdoc.json via `TsDocConfigBuilder.writeConfigFile()`
   (validates in CI instead of writing)
4. Dynamic import ESLint and plugins
5. Discover files using `ImportGraph.traceFromPackageExports()` or explicit `include`
6. Configure ESLint with tsdoc rules
7. Run linting on discovered files
8. Handle based on `onError` setting
9. Optionally persist tsdoc.json to project root for IDE support

**Error Handling:**

| onError | Behavior |
| --- | --- |
| `"warn"` | Log warnings, continue |
| `"error"` | Log errors, continue |
| `"throw"` | Throw Error, abort build |

Default: `"throw"` in CI, `"error"` locally

#### Phase 3: Bun Build

The build mode is determined by `options.bundle` (default: `true`):

**Bundle Mode (`bundle !== false`, default):**

**Inputs:**

- `BuildContext` with entries

**Operations:**

1. Convert entry paths to absolute
2. Build externals array from options
3. Configure Bun.build():
   - `target`: from `bunTarget` option (`"bun"` default, `"node"`, or `"browser"`)
   - `format`: from `format` option (`"esm"` default or `"cjs"`)
   - `splitting: false`
   - `sourcemap: "linked"` (dev) or `"none"` (npm)
   - `minify: false`
   - `packages: "external"` (keeps dependencies external)
   - `naming: "[dir]/[name].[ext]"` (preserves directory structure)
4. Execute `Bun.build()`
5. Post-process: rename outputs to match entry names
6. Clean up empty directories after renaming
7. Add outputs to files array (excluding .map)

**Bundleless Mode (`bundle: false`):**

**Inputs:**

- `BuildContext` with entries

**Operations (via `runBundlessBuild()`):**

1. Use `ImportGraph.traceFromEntries()` to discover all reachable source files
   from entry points
2. Build externals array from options
3. Configure Bun.build() with ALL discovered files as entrypoints:
   - Same bunTarget, format, sourcemap, and define options as bundle mode
   - `packages: "external"`
   - `naming: "[dir]/[name].[ext]"`
4. Execute `Bun.build()` (compiles each file individually, no bundling)
5. Post-process: strip `src/` prefix from output paths
   (`src/utils/helper.ts` becomes `utils/helper.js`)
6. Clean up empty `src/` directory after renaming
7. Add outputs to files array (excluding .map)

**Bundleless Mode Declaration Handling:**

After tsgo generates raw `.d.ts` files, they are copied directly to the output
directory without DTS rollup (no API Extractor declaration bundling). API
Extractor still runs for `.api.json` generation only if `apiModel` is enabled,
with `dtsRollup: { enabled: false }`.

**Outputs:**

- `{ outputs: BuildArtifact[], success: boolean }`

#### Phase 4: Declaration Generation

**Inputs:**

- `BuildContext`
- `tempDtsDir`: Temporary directory for declarations

**Operations:**

1. Delete stale `.tsbuildinfo*` files
2. Get temporary tsconfig from `TSConfigs.node.ecma.lib`
3. Write bundle-mode temp config with absolute paths
4. Spawn tsgo process with:
   - `--project <tempTsconfig>`
   - `--declaration`
   - `--emitDeclarationOnly`
   - `--declarationDir <tempDtsDir>`
5. Wait for completion

**Outputs:**

- `boolean` success indicator

#### Phase 5: Declaration Bundling (Multi-Entry)

**Inputs:**

- `BuildContext` (with `entries`, `exportPaths`)
- `tempDtsDir`: Directory with generated .d.ts files
- `apiModel`: ApiModelOptions or boolean
- `options`: `{ bundleless?: boolean }` (set when `bundle: false`)

**Architecture:**

API Extractor runs once per export entry point (bin entries are skipped). Each run
produces a per-entry bundled `.d.ts` file and optionally a per-entry API model JSON.
The per-entry models are then merged into a single Package with multiple EntryPoint
members.

In bundleless mode (`options.bundleless: true`), DTS rollup is disabled
(`dtsRollup: { enabled: false }`) and API Extractor runs only for `.api.json`
generation when `apiModel` is enabled.

**Operations:**

1. Validate API Extractor installed
2. Filter to export entries only (skip `bin/` entries)
3. Resolve API model configuration using `ApiModelConfigResolver`
4. Resolve `forgottenExports` behavior (`"include"` local, `"error"` CI)
5. Resolve `tsdoc.warnings` behavior (`"fail"` in CI, `"log"` locally, `"none"`)
6. Load `TSDocConfigFile.loadForFolder(cwd)` from `@microsoft/tsdoc-config`
   to respect `tsdoc.json` custom tag definitions (optional, falls back to defaults)
7. For each export entry:
   a. Find declaration file via `resolveDtsPath()`
   b. Configure API Extractor with entry-specific paths:
      - `enumMemberOrder: "preserve"` (preserves source order of enum members)
      - `dtsRollup`: enabled in bundle mode, disabled in bundleless mode
      - `tsdocMetadata`: only generated for main entry (`entryName === "index"`
        or single entry)
   c. Pass loaded `tsdocConfigFile` to `ExtractorConfig.prepare()`
   d. Run API Extractor (per-entry `.d.ts` + optional temp API model)
   e. Collect TSDoc warnings with source location info (`sourceFilePath`,
      `sourceFileLine`, `sourceFileColumn`) instead of suppressing them
   f. Collect forgotten export messages with source location info
   g. Read per-entry API model for merging
8. Process collected TSDoc warnings:
   - Separate first-party (project source) from third-party (node_modules)
   - Third-party warnings always logged (never fail the build)
   - First-party warnings respect `tsdoc.warnings` option:
     - `"fail"`: throw error (default in CI)
     - `"log"`: log as warnings (default locally)
     - `"none"`: suppress entirely
9. Process collected forgotten exports (error/include/ignore)
10. Merge per-entry API models via `mergeApiModels()`:
    - Main entry (`"."`) keeps canonical reference as `@scope/package!`
    - Sub-entries get rewritten references: `@scope/package/subpath!`
    - All member canonical references recursively rewritten
11. Generate resolved tsconfig.json using `TsconfigResolver`
12. Generate tsdoc.json in output directory
13. Handle failures by copying unbundled declarations

**Outputs:**

- `{ bundledDtsPaths?, apiModelPath?, tsdocMetadataPath?, tsconfigPath?,
    tsdocConfigPath?, dtsFiles? }`

**Generated Files (when enabled):**

- `<entry>.d.ts` - Per-entry bundled TypeScript declarations (bundle mode only)
- `<package>.api.json` - Merged API model with multiple EntryPoint members
- `tsdoc-metadata.json` - TSDoc custom tag definitions (main entry only)
- `tsconfig.json` - Resolved tsconfig for virtual TypeScript environments
- `tsdoc.json` - TSDoc tag configuration for documentation tools

#### Phase 6: Copy Files

**Inputs:**

- `BuildContext`
- `copyPatterns`: Array of patterns

**Auto-added patterns:**

1. `./src/public/` or `./public/` (if exists)
2. `README.md` (if exists)
3. `LICENSE` (if exists)

**Operations:**

1. Process each pattern
2. Resolve source and destination paths
3. Copy files/directories
4. Track copied files for files array

**Outputs:**

- `string[]` of copied file paths

#### Phase 7: Transform Files

**Inputs:**

- `TransformFilesContext`:
  - `outputs`: Map of filename to content
  - `filesArray`: Set of files to publish
  - `mode`: Build mode (`BuildMode`)
  - `target`: Publish target (`PublishTarget | undefined`)

**Operations:**

1. Call user's `transformFiles` callback
2. Allow modifications to outputs and filesArray

**User Responsibilities:**

- Add/modify output files
- Update files array as needed

#### Phase 8: Virtual Entries

**Inputs:**

- `virtualEntries` option: `Record<string, VirtualEntryConfig>`

**Purpose:** Bundle files that are NOT part of the package's public exports.
Virtual entries skip declaration generation and are not added to the exports
field, but ARE included in the files array for publishing.

**Use Cases:**

- `pnpmfile.cjs` for pnpm hooks
- CLI shims or setup scripts
- Configuration files that need bundling

**Operations:**

1. Group virtual entries by format (esm/cjs)
2. For each format group, run `Bun.build()`:
   - Uses same externals and bunTarget as main build
   - `sourcemap: "none"` (always)
   - `packages: "external"`
3. Rename outputs to match virtual entry output names
4. Add to filesArray for publishing

**Configuration:**

```typescript
interface VirtualEntryConfig {
  source: string;          // Path to source file
  format?: "esm" | "cjs"; // Output format (defaults to builder format)
}

// Example usage:
virtualEntries: {
  'pnpmfile.cjs': { source: './src/pnpmfile.ts', format: 'cjs' },
  'setup.js': { source: './src/setup.ts' },
}
```

#### Phase 10: Write package.json

**Inputs:**

- `BuildContext`
- `filesArray`: Set of files

**Operations:**

1. Build user transform function wrapper
2. Call `PackageJsonTransformer.build()`:
   - Resolve catalog references (npm only)
   - Apply build transformations
   - Call user transform
3. Set `private: true` for dev mode
4. Add sorted files array
5. Write to `<outdir>/package.json`

#### Phase 11: Copy to Local Paths (npm mode only)

**Inputs:**

- `BuildContext`
- Resolved `ApiModelConfig` from `ApiModelConfigResolver`

**Prerequisites:**

- Build mode is `npm`
- Not running in CI environment
- `apiModel.localPaths` array is non-empty

**Operations:**

1. Create `LocalPathCopier` with artifact filenames
2. For each path in `localPaths`:
   - Resolve path relative to `cwd`
   - Create destination directory if needed
   - Copy API model file (if exists)
   - Copy tsdoc-metadata.json (if exists)
   - Copy tsconfig.json (if exists)
   - Copy tsdoc.json (if exists)
   - Copy package.json
3. Log copied files for each destination

**Why skip in CI:**

Local path copying is intended for development workflows where build artifacts
need to sync with documentation sites. In CI environments, documentation sites
typically pull artifacts from published packages or build outputs, making local
copying unnecessary and potentially causing side effects.

---

## Data Flow

### Entry Detection Flow

```text
package.json
         |
         v
+----------------------------------------+
| EntryExtractor.extract()               |
|   - Parse exports field                |
|     - String: "./src/index.ts"         |
|     - Object: { import, types, default }
|     - Subpath: { "./utils": "..." }    |
|   - Parse bin field                    |
|     - String: "./src/cli.ts"           |
|     - Object: { cmd: "./src/cli.ts" }  |
|   - Map to TypeScript sources          |
|   - Generate entry names               |
|   - Track original export keys         |
+----------------------------------------+
         |
         v
    entries: {                    exportPaths: {
      "index": "./src/index.ts",    "index": ".",
      "utils": "./src/utils.ts",    "utils": "./utils"
      "bin/cli": "./src/bin/cli.ts"  // bin entries excluded
    }                             }
```

The `exportPaths` mapping is critical for multi-entry API model merging: it tells
`mergeApiModels()` which canonical reference prefix to use for each sub-entry.

### Catalog Resolution Flow

```text
package.json with catalog: references
         |
         v
+----------------------------------------+
| BunCatalogResolver.resolvePackageJson()|
|   1. Find workspace root               |
|   2. Load catalogs from root pkg.json  |
|   3. For each dependency field:        |
|      - dependencies                    |
|      - devDependencies                 |
|      - peerDependencies                |
|      - optionalDependencies            |
|   4. Resolve catalog: references       |
|   5. Resolve workspace:* references    |
|   6. Validate no unresolved remain     |
+----------------------------------------+
         |
         v
    Resolved package.json with versions
```

### Package.json Transformation Flow

```text
Source package.json
         |
         v
+----------------------------------------+
| PackageJsonTransformer.build()         |
|                                        |
| Production only (isProduction=true):   |
| PackageJsonTransformer.resolveCatalogReferences()
|   - Delegates to BunCatalogResolver    |
|   - Resolves catalog: references       |
|   - Resolves workspace: references     |
+----------------------------------------+
         |
         v
+----------------------------------------+
| PackageJsonTransformer.applyBuildTransformations()
|   - Remove publishConfig, scripts      |
|   - Set private based on publishConfig |
|   - transformExports()                 |
|     - .ts/.tsx -> .js                  |
|     - Add types conditions             |
|     - Strip src/ prefix                |
|   - transformBin()                     |
|   - Transform typesVersions            |
|   - Transform files array              |
|   - Sort with sort-package-json        |
+----------------------------------------+
         |
         v
    User transform function (if provided)
    (receives { mode, target: PublishTarget | undefined, pkg })
         |
         v
    Add files array from build
         |
         v
    Write to dist/<mode>/package.json
```

### Declaration Generation Flow

```text
Source .ts files
         |
         v
    TSConfigs.node.ecma.lib.writeBundleTempConfig(target)
         |
         v
    Temp tsconfig.json with:
    - Absolute paths
    - declarationMap: true
    - emitDeclarationOnly: false (CLI overrides)
         |
         v
    tsgo --declaration --emitDeclarationOnly
         |
         v
    .bun-builder/declarations/{mode}/*.d.ts
         |
         v
+----------------------------------------+
| ApiModelConfigResolver.resolve()       |
|   - apiModel undefined -> enabled:true |
|   - apiModel false -> enabled:false    |
|   - Apply defaults, merge env paths    |
+----------------------------------------+
         |
         v
+----------------------------------------+
| Load TSDocConfigFile                   |
|   TSDocConfigFile.loadForFolder(cwd)   |
|   (optional, falls back to defaults)   |
+----------------------------------------+
         |
         v
+----------------------------------------+
| Per-Entry API Extractor Loop           |
|   For each export entry (skip bin/):   |
|   - resolveDtsPath(sourcePath)         |
|   - Configure API Extractor per entry  |
|   - enumMemberOrder: "preserve"        |
|   - dtsRollup: enabled (bundle) or    |
|     disabled (bundleless)              |
|   - tsdocMetadata: main entry only     |
|   - Pass tsdocConfigFile              |
|   - Run Extractor.invoke()             |
|   - Collect TSDoc warnings w/ source   |
|   - Collect forgottenExport w/ source  |
|   - Read per-entry model for merging   |
+----------------------------------------+
         |
         v
+----------------------------------------+
| TSDoc warnings handling                |
|   First-party vs third-party separated |
|   "fail": throw (default in CI)        |
|   "log": log warning (default local)   |
|   "none": suppress entirely            |
+----------------------------------------+
         |
         v
+----------------------------------------+
| forgottenExports handling              |
|   "error": throw (default in CI)       |
|   "include": log warning (default local)|
|   "ignore": suppress silently          |
+----------------------------------------+
         |
         v
+----------------------------------------+
| mergeApiModels() (multi-entry)         |
|   - Main entry: canonical = pkg!       |
|   - Sub-entries: canonical = pkg/sub!  |
|   - Rewrite member canonical refs      |
|   - Combine into single Package        |
|   - Clean up temp per-entry JSON files |
+----------------------------------------+
         |
         v
+----------------------------------------+
| TsconfigResolver (if apiModel enabled) |
|   - Parse project tsconfig.json        |
|   - Convert enums to strings           |
|   - Set composite: false, noEmit: true |
|   - Write resolved tsconfig.json       |
+----------------------------------------+
         |
         v
+----------------------------------------+
| TsDocConfigBuilder (if apiModel)       |
|   - Build tag config from options      |
|   - In CI: validate existing file      |
|   - Locally: write tsdoc.json to dist  |
+----------------------------------------+
         |
         v
    dist/{mode}/<entry>.d.ts (per entry, bundle mode only)
    dist/{mode}/**/*.d.ts (bundleless: raw tsgo output)
    dist/{mode}/<pkg>.api.json (merged, if apiModel)
    dist/{mode}/tsdoc-metadata.json (main entry only, if apiModel)
    dist/{mode}/tsconfig.json (if apiModel)
    dist/{mode}/tsdoc.json (if apiModel)
         |
         v (npm mode, non-CI, localPaths configured)
+----------------------------------------+
| LocalPathCopier                        |
|   - Copy API model to local paths      |
|   - Copy tsdoc-metadata.json           |
|   - Copy tsconfig.json                 |
|   - Copy tsdoc.json                    |
|   - Copy package.json                  |
+----------------------------------------+
         |
         v
    {localPath}/<pkg>.api.json
    {localPath}/tsdoc-metadata.json
    {localPath}/tsconfig.json
    {localPath}/tsdoc.json
    {localPath}/package.json
```

---

## Configuration Reference

### BunLibraryBuilderOptions

```typescript
interface BunLibraryBuilderOptions {
  // Entry point configuration
  entry?: Record<string, string>;     // Override auto-detected entries
  exportsAsIndexes?: boolean;         // Use dir/index.js structure

  // Output configuration
  targets?: BuildMode[];              // ["dev", "npm"] default
  format?: "esm" | "cjs";            // Output module format (default: "esm")
  bundle?: boolean;                   // Bundled (true) or bundleless (false) mode
  bunTarget?: "bun" | "node" | "browser"; // Bun.build() target (default: "bun")
  copyPatterns?: (string | CopyPatternConfig)[];

  // Bundling configuration
  externals?: (string | RegExp)[];    // Dependencies to exclude
  plugins?: BunPlugin[];              // Bun bundler plugins
  define?: Record<string, string>;    // Build-time constants

  // TypeScript configuration
  tsconfigPath?: string;              // Default: "./tsconfig.json"
  dtsBundledPackages?: string[];      // Bundle these type definitions

  // Transformation hooks
  transform?: TransformPackageJsonFn; // Modify output package.json
  transformFiles?: TransformFilesCallback; // Post-build processing

  // Documentation and API model (TSDoc lint nested here)
  apiModel?: ApiModelOptions | boolean; // API model + TSDoc lint

  // Virtual entries (bundled but not exported, no types)
  virtualEntries?: Record<string, VirtualEntryConfig>;
}
```

**Default options** (from `BunLibraryBuilder.DEFAULT_OPTIONS`):

- `apiModel: true` - API model generation enabled by default
- `bundle: true` - Bundled output mode by default

**Notable changes from previous versions:**

- `bundle` option added (`true` default; `false` enables bundleless mode)
- `tsdocLint` top-level option removed; lint is now at `apiModel.tsdoc.lint`
- `format` option added (was hardcoded to `"esm"`)
- `bunTarget` option added (was hardcoded to `"node"`, now defaults to `"bun"`)
- `virtualEntries` option added for non-exported bundled files

### Build Mode Differences

| Option | dev | npm |
| --- | --- | --- |
| Source maps | `"linked"` | `"none"` |
| Minify | `false` | `false` |
| API model | `false` | Per option (default: `true`) |
| DTS rollup | Per `bundle` option | Per `bundle` option |
| Catalog resolution | No | Yes |
| `private` field | `true` | Based on publishConfig |
| Local path copying | No | Yes (non-CI only) |

Note: When `bundle: false`, both modes use bundleless mode (individual file
compilation with raw `.d.ts` files). DTS rollup via API Extractor is disabled,
but API model (`.api.json`) generation still runs for the npm mode.

### ApiModelOptions

```typescript
interface ApiModelOptions {
  enabled?: boolean;           // Default: true (when apiModel is undefined or true)
  filename?: string;           // Default: "<pkg>.api.json"
  localPaths?: string[];       // Copy artifacts to these paths (see below)
  tsdoc?: TsDocOptions;        // TSDoc config (shared with lint, see below)
  tsdocMetadata?: TsDocMetadataOptions | boolean;
  forgottenExports?: "include" | "error" | "ignore";
    // Default: "error" in CI, "include" locally
}

interface TsDocMetadataOptions {
  enabled?: boolean;           // Default: true when API model enabled
  filename?: string;           // Default: "tsdoc-metadata.json"
}
```

**API Model Defaults to Enabled:** When `apiModel` is `undefined` (not specified
in options), `ApiModelConfigResolver.resolve()` returns `enabled: true`. This means
npm mode builds generate API models by default. Set `apiModel: false` to disable.

**Forgotten Exports:** Controls how API Extractor's `ae-forgotten-export` messages
are handled. In CI, defaults to `"error"` (fails the build). Locally, defaults to
`"include"` (logs as warnings). Use `"ignore"` to suppress entirely. Forgotten
export warnings now include source location info (`sourceFilePath`,
`sourceFileLine`, `sourceFileColumn`) for better debugging.

**TSDoc Metadata (Main Entry Only):** `tsdoc-metadata.json` is generated only for
the main entry point (`entryName === "index"` or when there is a single export
entry). This prevents duplicate metadata files in multi-entry packages.

#### apiModel.localPaths Feature

The `localPaths` option copies build artifacts to specified directories after
build completion. This is useful for syncing API documentation with documentation
sites that need access to API models.

**Artifacts copied:**

- API model file (e.g., `my-package.api.json`)
- TSDoc metadata file (`tsdoc-metadata.json`)
- Transformed `package.json`

**Behavior:**

- Only runs for `npm` mode
- Skipped in CI environments (detected via `CI` or `GITHUB_ACTIONS` env vars)
- Validates parent directories exist before build starts (fail-fast)
- Creates destination directories if they don't exist

**Example:**

```typescript
import { BunLibraryBuilder } from '@savvy-web/bun-builder';

export default BunLibraryBuilder.create({
  apiModel: {
    enabled: true,
    localPaths: [
      '../website/docs/api/my-package',  // Relative to project root
      './docs/api',                       // Also relative
    ],
  },
});
```

**Validation:**

Parent directories of each path must exist. For example, if `localPaths`
includes `../website/docs/api/my-package`, then `../website/docs/api` must
exist. The final directory (`my-package`) will be created automatically.

### TsDocOptions (with nested lint and warnings)

TSDoc configuration is shared between API model generation and lint validation.
Configure once at `apiModel.tsdoc`, and lint picks up the same tag definitions.

```typescript
interface TsDocOptions {
  groups?: TsDocTagGroup[];           // Default: ["core", "extended", "discretionary"]
  tagDefinitions?: TsDocTagDefinition[];
  supportForTags?: Record<string, boolean>;
  persistConfig?: boolean | string;   // Default: true locally, false in CI
  warnings?: "log" | "fail" | "none"; // Default: "fail" in CI, "log" locally
  lint?: TsDocLintOptions | boolean;  // TSDoc lint configuration
}

interface TsDocLintOptions {
  enabled?: boolean;           // Default: true when apiModel enabled
  include?: string[];          // Override file discovery
  onError?: "warn" | "error" | "throw"; // Default: throw in CI
}
```

**Configuration path:** `apiModel.tsdoc.lint`

**TSDoc Warnings (`tsdoc.warnings`):** Controls how API Extractor TSDoc warnings
are handled during declaration bundling. Warnings are collected with full source
location info (`sourceFilePath`, `sourceFileLine`, `sourceFileColumn`) instead of
being suppressed. They are separated into two categories:

- **First-party warnings** (project source files): Respect the `warnings` option
  - `"fail"` (default in CI): Throw an error and abort the build
  - `"log"` (default locally): Log as warnings and continue
  - `"none"`: Suppress entirely
- **Third-party warnings** (node_modules): Always logged as warnings, never
  fail the build regardless of the `warnings` setting

**Example:**

```typescript
BunLibraryBuilder.create({
  apiModel: {
    tsdoc: {
      groups: ['core', 'extended', 'discretionary'],
      tagDefinitions: [{ tagName: '@slot', syntaxKind: 'block' }],
      lint: {
        enabled: true,
        onError: 'error',
        include: ['src/**/*.ts'],
      },
    },
  },
});
```

### CopyPatternConfig

```typescript
interface CopyPatternConfig {
  from: string;                // Source path
  to?: string;                 // Destination (default: "./")
  noErrorOnMissing?: boolean;  // Suppress missing file warnings
}
```

### VirtualEntryConfig

```typescript
interface VirtualEntryConfig {
  source: string;              // Path to source file (relative to cwd)
  format?: "esm" | "cjs";     // Output format (defaults to builder format)
}
```

---

## Integration Points

### Bun Build Integration

**Bundle mode** (`bundle !== false`, default):

```typescript
const result = await Bun.build({
  entrypoints: absoluteEntryPaths,
  outdir: context.outdir,
  target: context.options.bunTarget ?? "bun",    // "bun", "node", or "browser"
  format: context.options.format ?? "esm",       // "esm" or "cjs"
  splitting: false,
  sourcemap: mode === "dev" ? "linked" : "none",
  minify: false,
  external: externalPackages,
  packages: "external",                          // Keep dependencies external
  naming: "[dir]/[name].[ext]",                  // Preserve directory structure
  define: {
    "process.env.__PACKAGE_VERSION__": JSON.stringify(version),
    ...userDefine,
  },
  plugins: userPlugins,
});
```

**Bundleless mode** (`bundle: false`):

```typescript
// Discover all reachable source files from entry points
const graph = new ImportGraph({ rootDir: context.cwd });
const traceResult = graph.traceFromEntries(entryPaths);

const result = await Bun.build({
  entrypoints: traceResult.files,  // All discovered source files
  outdir: context.outdir,
  target: context.options.bunTarget ?? "bun",
  format: context.options.format ?? "esm",
  splitting: false,
  sourcemap: mode === "dev" ? "linked" : "none",
  minify: false,
  external: externalPackages,
  packages: "external",
  naming: "[dir]/[name].[ext]",
  define: { ... },
  plugins: userPlugins,
});
// Post-process: strip src/ prefix from output paths
```

### tsgo Integration

```typescript
const args = [
  "--project", tempTsconfigPath,
  "--declaration",
  "--emitDeclarationOnly",
  "--declarationDir", tempDtsDir,
];

spawn(tsgoBinPath, args, { cwd, stdio: [...] });
```

### API Extractor Integration (Per-Entry)

API Extractor is invoked once per export entry point. Per-entry API models are
then merged into a single Package with multiple EntryPoint members.

```typescript
// Load tsdoc.json config for custom tag definitions
const { TSDocConfigFile } = await import("@microsoft/tsdoc-config");
const tsdocConfigFile = TSDocConfigFile.loadForFolder(context.cwd);

// Per-entry invocation (runs in a loop over all export entries)
const extractorConfig = ExtractorConfig.prepare({
  configObject: {
    projectFolder: cwd,
    mainEntryPointFilePath: perEntryDtsPath,
    compiler: { tsconfigFilePath },
    enumMemberOrder: "preserve",
    dtsRollup: isBundleless
      ? { enabled: false }
      : { enabled: true, untrimmedFilePath: perEntryBundledDtsPath },
    docModel: apiModelEnabled ? {
      enabled: true,
      apiJsonFilePath: perEntryApiModelPath, // Temp file
    } : { enabled: false },
    tsdocMetadata: isMainEntry  // Only for "index" or single entry
      ? { enabled: true, tsdocMetadataFilePath: ... }
      : { enabled: false },
    bundledPackages: dtsBundledPackages,
  },
  packageJsonFullPath: join(cwd, "package.json"),
  tsdocConfigFile,  // Pass loaded TSDocConfigFile
});

Extractor.invoke(extractorConfig, {
  localBuild: true,
  messageCallback: (message) => {
    // Collect TSDoc warnings with source location info
    // Collect ae-forgotten-export messages with source location info
    // Suppress TypeScript version and signature change warnings
  },
});

// After all entries processed:
// 1. Process TSDoc warnings (first-party vs third-party, fail/log/none)
// 2. Process forgotten exports (error/include/ignore)
// 3. Merge API models
const merged = mergeApiModels({
  perEntryModels,
  packageName: '@scope/package',
  exportPaths: context.exportPaths,
});
```

### External Dependencies

**Build Tools:**

- **bun**: Native runtime and bundler

**Type Generation:**

- **@typescript/native-preview (tsgo)**: Fast declaration generation
- **@microsoft/api-extractor**: Declaration bundling, API model generation
- **@microsoft/tsdoc-config**: TSDocConfigFile loading for API Extractor
- **typescript**: TypeScript compiler API for config parsing

**TSDoc Validation:**

- **eslint**: ESLint core for programmatic linting
- **@typescript-eslint/parser**: TypeScript parser for ESLint
- **eslint-plugin-tsdoc**: TSDoc validation rules

**Package.json Processing:**

- **sort-package-json**: Consistent field ordering

**Utilities:**

- **picocolors**: Terminal coloring

Note: File pattern matching uses `Bun.Glob().scan()` (requires `dot: true` option for
dotfiles). Temporary files use `os.tmpdir()` + `crypto.randomUUID()` instead of external
packages.

---

## Testing Strategy

### Test Organization

Tests are co-located with source files:

```text
src/
├── builders/
│   ├── bun-library-builder.ts
│   └── bun-library-builder.test.ts
├── hooks/
│   ├── build-lifecycle.ts
│   └── build-lifecycle.test.ts
├── plugins/utils/
│   ├── entry-extractor.ts
│   ├── entry-extractor.test.ts
│   ├── catalog-resolver.ts
│   ├── catalog-resolver.test.ts
│   └── ...
└── __test__/
    └── utils/                # Shared test utilities
```

### Testing Approach

**Unit Tests:**

- Test utility functions in isolation
- Mock filesystem operations
- Verify transformations produce expected output

**Integration Tests:**

- Test build lifecycle with mock context
- Verify phase interactions
- Test error handling paths

**Type Safety:**

- Never use `as any`
- Create proper mock types
- Test type exports

### Running Tests

```bash
# Run all tests
bun test

# Run with coverage
bun test --coverage

# Watch mode
bun test --watch
```

---

## Future Enhancements

### Phase 1: Short-term

- **Watch mode**: Rebuild on file changes
- **Incremental declarations**: Cache tsgo output
- **Parallel mode builds**: Build dev and npm concurrently
- **Publish target iteration**: Iterate over `publishConfig.targets` in the build
  lifecycle, passing each `PublishTarget` to transform callbacks for per-registry
  package.json customization

### Phase 2: Medium-term

- **Source map preservation**: Optional .map file distribution
- **JSR target support**: Publish to JavaScript Registry

### Phase 3: Long-term

- **Monorepo support**: Build multiple packages in workspace
- **Remote caching**: Share build cache across CI runs
- **Plugin system**: User-defined build phases

**Recently Completed (feat/target-vs-mode):**

- `BuildTarget` renamed to `BuildMode` with new `PublishTarget` type for publish destinations
- Transform callbacks receive `{ mode, target: PublishTarget | undefined, pkg }`
- `PublishConfig.targets` field for per-registry publish configuration
- All internal APIs aligned: `resolveModes()`, `run(modes?)`, `build(mode)`,
  `executeBuild(options, mode)`, `BuildContext.mode`, `BuildResult.mode`

**Previously Completed (feat/support-tsx-files):**

- `bundle: false` bundleless mode with `ImportGraph.traceFromEntries()` file discovery
- TSDoc warnings collection with source location info and first-party/third-party separation
- Forgotten exports source locations (`sourceFilePath`, `sourceFileLine`, `sourceFileColumn`)
- `tsdoc-metadata.json` generated only for main entry
- `enumMemberOrder: "preserve"` in API Extractor config
- `reportUnsupportedHtmlElements: true` in TSDoc config
- `BunLibraryBuilder.DEFAULT_OPTIONS` (`apiModel: true, bundle: true`)
- `TSDocConfigFile.loadForFolder()` for API Extractor custom tag support

**Previously Completed (feat/rslib-builder-alignment):**

- Multi-entry declaration bundling (API Extractor per entry with model merging)
- CJS output format support via `format` option
- Virtual entries for non-exported bundled files
- TSDoc CI validation flow

---

## Related Documentation

**Package Documentation:**

- `README.md` - Package overview and usage
- `CLAUDE.md` - Development guide for AI agents

**External Resources:**

- [Bun Documentation](https://bun.sh/docs) - Runtime and bundler docs
- [Bun.build() API](https://bun.sh/docs/bundler) - Bundler configuration
- [API Extractor](https://api-extractor.com/) - Declaration bundling
- [TSDoc](https://tsdoc.org/) - Documentation comment syntax

---

**Document Status:** Current - Fully documented including BuildMode/PublishTarget
terminology split, bundleless mode, TSDoc warning collection with source locations,
forgotten export source locations, tsdoc-metadata main entry restriction,
enumMemberOrder preserve, TSDocConfigFile loading, and DEFAULT_OPTIONS on
BunLibraryBuilder.

**Recent Changes (feat/target-vs-mode branch):**

- `BuildTarget` type renamed to `BuildMode` throughout; values unchanged ("dev" | "npm")
- `BuildResult.target`, `BuildContext.target` renamed to `.mode`
- `BunLibraryBuilder.DEFAULT_TARGETS` renamed to `DEFAULT_MODES`
- `resolveTargets()` renamed to `resolveModes()`
- `run(targets?)` -> `run(modes?)`, `build(target)` -> `build(mode)`
- `executeBuild(options, target)` -> `executeBuild(options, mode)`
- `TransformPackageJsonFn` context changed from `{ target: BuildTarget; pkg }` to
  `{ mode: BuildMode; target: PublishTarget | undefined; pkg }`
- `TransformFilesContext` now has `.mode` (`BuildMode`) + `.target` (`PublishTarget | undefined`)
- New `PublishTarget` interface for publish destination configuration
  (protocol, registry, directory, access, provenance)
- `PublishConfig.targets?: JsonArray` field added to `package-json.ts`

**Previous Changes (feat/support-tsx-files branch):**

- `bundle: false` bundleless mode added to `BunLibraryBuilderOptions`; when enabled,
  `runBundlessBuild()` uses `ImportGraph.traceFromEntries()` to discover files,
  compiles individually via `Bun.build()`, and copies raw `.d.ts` files instead of
  API Extractor DTS rollup
- TSDoc warnings from API Extractor are now collected with source location info
  (`sourceFilePath`, `sourceFileLine`, `sourceFileColumn`) and separated into
  first-party vs third-party; respects `tsdoc.warnings` option (`"fail"` in CI,
  `"log"` locally, `"none"` to suppress)
- Forgotten export warnings now include `sourceFilePath`, `sourceFileLine`,
  `sourceFileColumn` for better debugging
- `tsdoc-metadata.json` generated only for main entry (`entryName === "index"` or
  single export entry)
- `enumMemberOrder: "preserve"` added to API Extractor config to preserve source
  order of enum members
- `reportUnsupportedHtmlElements: true` set in `TsDocConfigBuilder.buildConfigObject()`
- `BunLibraryBuilder.DEFAULT_OPTIONS` static readonly property added with
  `{ apiModel: true, bundle: true }`, merged in constructor
- API Extractor now loads `tsdoc.json` via `TSDocConfigFile.loadForFolder()` from
  `@microsoft/tsdoc-config` for custom tag definition support

**Previous Changes (feat/rslib-builder-alignment branch):**

- `exportPaths` field added to `ExtractedEntries` and `BuildContext` for tracking
  original package.json export keys
- Multi-entry API Extractor: runs per export entry, merges per-entry API models
  via `mergeApiModels()` with canonical reference rewriting for sub-entries
- `tsdocLint` top-level option removed from `BunLibraryBuilderOptions`; lint is
  now nested under `apiModel.tsdoc.lint` sharing tag configuration with API model
- `virtualEntries` option for bundling non-exported files (pnpmfile.cjs, CLI shims)
  that skip type generation
- `forgottenExports` option on `ApiModelOptions` (`"include"` | `"error"` | `"ignore"`)
  for controlling API Extractor's forgotten export messages
- `format` option on `BunLibraryBuilderOptions` (`"esm"` | `"cjs"`, default: `"esm"`)
- `bunTarget` option for Bun.build() target (`"bun"` default, `"node"`, `"browser"`)
- `TsDocConfigBuilder.buildConfigObject()` and `validateConfigFile()` for CI validation;
  `writeConfigFile()` validates existing file in CI instead of writing
- `ApiModelConfigResolver.resolve()` returns `enabled: true` when `apiModel` is undefined
- Bun.build() now uses `packages: "external"` and `naming: "[dir]/[name].[ext]"` with
  post-build output renaming to match entry names
