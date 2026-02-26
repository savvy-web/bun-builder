---
status: current
module: bun-builder
category: architecture
created: 2026-01-26
updated: 2026-02-26
last-synced: 2026-02-26
completeness: 95
related:
  - bun-builder/build-lifecycle.md
  - bun-builder/configuration-reference.md
  - bun-builder/api-model-options.md
  - bun-builder/testing-strategy.md
dependencies: []
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
5. [Build Lifecycle](./build-lifecycle.md)
6. [Data Flow](#data-flow)
7. [Configuration Reference](./configuration-reference.md)
8. [API Model Options](./api-model-options.md)
9. [Testing Strategy](./testing-strategy.md)
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
- **Minimal API surface**: Public exports limited to `BunLibraryBuilder`, builder
  types, and package-json utility types; utility classes are internal implementation
  details

**When to reference this document:**

- When understanding the build pipeline phases
- When modifying build lifecycle hooks
- When debugging build output issues
- When extending the builder with new options
- When understanding catalog/workspace resolution

---

## Current State

### Public API Surface

The package exports from `src/index.ts` are intentionally minimal:

**Core Builder:**

- `BunLibraryBuilder` - Main builder class

**Builder Types** (from `./builders/bun-library-builder.ts`):

- `ApiModelOptions`, `BuildMode`, `BuildResult`, `BunLibraryBuilderOptions`
- `CopyPatternConfig`, `EntryPoints`, `PublishProtocol`, `PublishTarget`
- `TransformFilesCallback`, `TransformFilesContext`, `TransformPackageJsonFn`
- `TsDocLintErrorBehavior`, `TsDocLintOptions`, `TsDocMetadataOptions`
- `TsDocOptions`, `TsDocTagDefinition`, `TsDocTagGroup`
- `VirtualEntryConfig`

**Package.json Utility Types** (from `./types/package-json.ts`):

- `JsonArray`, `JsonObject`, `JsonPrimitive`, `JsonValue`
- `LiteralUnion`, `PackageJson`, `Primitive`

The package-json utility types were added as public exports because they are
used in the public `PackageJson` type surface. Without exporting them,
consumers would encounter "forgotten export" errors when using the `PackageJson`
type and its nested generic types. All utility classes (`BuildLogger`,
`EntryExtractor`, `BunCatalogResolver`, etc.) remain internal implementation
details.

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
| `resolvePublishTargets()` | Resolve `publishConfig.targets` into `PublishTarget[]` |
| `runTsDocLint()` | Pre-build TSDoc validation |
| `runBunBuild()` | Execute Bun.build() bundling (bundle mode) |
| `runBundlessBuild()` | Individual file compilation (bundleless mode) |
| `runTsgoGeneration()` | Generate .d.ts with tsgo |
| `runApiExtractor()` | Per-entry declaration bundling with API Extractor |
| `mergeApiModels()` | Merge per-entry API models with canonical reference rewriting |
| `writePackageJson()` | Transform and write package.json (per publish target) |
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
  publishTargets: PublishTarget[];      // Resolved from publishConfig.targets
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
| `BuildLogger.isCI()` | Check if running in CI (see CI Detection below) |
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

**CI Detection (`BuildLogger.isCI()`):**

Checks for common CI environment indicators, accepting both `"true"` and `"1"`
values:

- `CI=true` or `CI=1`
- `GITHUB_ACTIONS=true` or `GITHUB_ACTIONS=1`

`TsDocConfigBuilder.isCI()` delegates to `BuildLogger.isCI()` for consistent
CI detection across the codebase. CI detection affects:

- TSDoc warnings default behavior (`"fail"` in CI, `"log"` locally)
- Forgotten exports default behavior (`"error"` in CI, `"include"` locally)
- TSDoc lint `onError` default (`"throw"` in CI, `"error"` locally)
- Local path copying (skipped in CI)
- tsdoc.json persistence (validate-only in CI, write locally)

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
| `writeConfigFile(options, dir, skipCI?)` | Write tsdoc.json (or validate in CI) |
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

The `skipCIValidation` parameter (third argument, default `false`) bypasses CI
validation when set to `true`. This is used for the dist output `tsdoc.json`,
which is a generated build artifact that should always be written fresh rather
than validated against an existing file. The CI validation check is only appropriate
for the project-root `tsdoc.json` that is committed to version control.

```typescript
import { TsDocConfigBuilder } from '@savvy-web/bun-builder';

// Build config for all standard tags
const config = TsDocConfigBuilder.build();
// { tagDefinitions: [], supportForTags: {...}, useStandardTags: true }

// Build serializable config object (no file I/O)
const configObj = TsDocConfigBuilder.buildConfigObject({ groups: ['core'] });

// Write to project root (validates in CI instead of writing)
await TsDocConfigBuilder.writeConfigFile({}, './tsdoc.json');

// Write to dist output (always writes, even in CI — skipCIValidation=true)
await TsDocConfigBuilder.writeConfigFile({}, './dist/npm', true);

// Explicitly validate against expected config
await TsDocConfigBuilder.validateConfigFile({}, './tsdoc.json');
```

#### Component 15: ImportGraph

**Location:** `src/plugins/utils/import-graph.ts`

**Purpose:** Analyzes TypeScript import relationships to discover all files
reachable from specified entry points. Used by TSDoc linting for file discovery,
by bundleless mode (`runBundlessBuild()`) to discover all source files that
need individual compilation, and by the declaration generation phase to build an
allowlist of reachable files for filtering test files and non-reachable
declarations from output.

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
|    1. Setup (read pkg, extract entries+exportPaths,         |
|       resolve publish targets)                              |
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
|   10. Copy artifacts + Write package.json (per target)      |
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
|    - ImportGraph: Trace imports for lint + bundleless + DTS |
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

The `PublishTarget` type represents a fully resolved publish destination (e.g.,
npm registry, GitHub Packages, JSR). Publish targets are resolved from
`publishConfig.targets` in package.json by the `resolvePublishTargets()` function
and stored in `BuildContext.publishTargets`.

```typescript
type PublishProtocol = "npm" | "jsr";

interface PublishTarget {
  protocol: PublishProtocol;            // "npm" or "jsr"
  registry: string | null;             // Registry URL, or null for JSR targets
  directory: string;                   // Absolute path to output directory
  access: "public" | "restricted";     // Package access level (required)
  provenance: boolean;                 // Whether provenance attestations are configured (required)
  tag: string;                         // Publish tag, e.g., "latest" (required)
}
```

This type aligns with the `ResolvedTarget` type from `workflow-release-action`,
minus authentication-specific fields.

**`resolvePublishTargets()` function** (in `build-lifecycle.ts`):

Resolves `publishConfig.targets` from package.json into a `PublishTarget[]`.
Supports shorthand strings and full target objects:

| Shorthand | Protocol | Registry | Provenance |
| --- | --- | --- | --- |
| `"npm"` | `npm` | `https://registry.npmjs.org/` | `true` |
| `"github"` | `npm` | `https://npm.pkg.github.com/` | `true` |
| `"jsr"` | `jsr` | `null` | `false` |
| URL string | `npm` | the URL | `false` |

Shorthands are expanded via the `KNOWN_TARGET_SHORTHANDS` constant. Default
`access` is inherited from `publishConfig.access` (or `"restricted"`), and
default `tag` is `"latest"`.

**Publish target iteration in the build lifecycle:**

When `publishConfig.targets` is configured, the `transform` and `transformFiles`
callbacks are called once per publish target. The `writePackageJson` phase also
iterates over publish targets, writing to each target's output directory. When no
targets are configured, both are called once with `target: undefined` (backward
compatible).

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
│   ├── index.ts                 # Main exports (BunLibraryBuilder + builder types
│   │                            #   + package-json utility types)
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
│   │       ├── import-graph.ts           # ImportGraph class for TSDoc lint,
│   │       │                             # bundleless mode, and DTS filtering
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
├── __test__/
│   ├── e2e/                     # End-to-end build tests
│   │   ├── bundle-mode.e2e.test.ts    # Bundle mode output + test file exclusion
│   │   ├── bundleless-mode.e2e.test.ts # Bundleless structure + raw .d.ts
│   │   ├── publish-targets.e2e.test.ts # Multi-target artifact copying
│   │   └── utils/
│   │       ├── build-fixture.ts       # buildFixture() + cleanStaleTempDirs()
│   │       └── assertions.ts          # E2E assertion helpers
│   └── fixtures/
│       ├── single-entry/        # Single export with helper.test.ts
│       ├── bundleless-entry/    # Bundleless mode with nested modules
│       └── multi-target/        # Multi-registry publishConfig.targets
├── bun.config.ts                # Self-builds using BunLibraryBuilder
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Build Lifecycle

> **Moved to [build-lifecycle.md](./build-lifecycle.md)**
>
> The 12-phase build pipeline orchestrated by `executeBuild()`. Covers bundle
> and bundleless modes, tool integrations, and environment-aware behavior.

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
    (called once per publish target, or once with target: undefined)
         |
         v
    Add files array from build
         |
         v
    Write to target directory (or dist/<mode>/package.json)
```

### Declaration Generation Flow

```text
Source .ts files
         |
         v
+----------------------------------------+
| ImportGraph.traceFromEntries()         |
|   - Trace reachable files from entries |
|   - Convert to .d.ts equivalents      |
|   - Build tracedFiles: Set<string>     |
|   - Filters test files from DTS output |
+----------------------------------------+
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
|   - skipCIValidation=true (dist output)|
|   - Always writes (generated artifact) |
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

> **Moved to [configuration-reference.md](./configuration-reference.md)**
>
> Complete reference for `BunLibraryBuilderOptions` and related types.
> See also: [API Model Options](./api-model-options.md) for `ApiModelOptions`
> and TSDoc configuration.

---

## Testing Strategy

> **Moved to [testing-strategy.md](./testing-strategy.md)**
>
> Test organization, E2E infrastructure, and coverage configuration.

---

## Future Enhancements

### Phase 1: Short-term

- **Watch mode**: Rebuild on file changes
- **Incremental declarations**: Cache tsgo output
- **Parallel mode builds**: Build dev and npm concurrently

### Phase 2: Medium-term

- **Source map preservation**: Optional .map file distribution
- **JSR build transformations**: JSR-specific output transformations (JSR protocol
  is supported in `PublishTarget` resolution, but JSR-specific build transforms
  like jsr.json generation are not yet implemented)

### Phase 3: Long-term

- **Monorepo support**: Build multiple packages in workspace
- **Remote caching**: Share build cache across CI runs
- **Plugin system**: User-defined build phases

---

## Related Documentation

**Design Documentation:**

- [Build Lifecycle](./build-lifecycle.md) - 12-phase pipeline, tool integrations
- [Configuration Reference](./configuration-reference.md) - Builder options
- [API Model Options](./api-model-options.md) - API model configuration
- [Testing Strategy](./testing-strategy.md) - Test organization and E2E

**Package Documentation:**

- `README.md` - Package overview and usage
- `CLAUDE.md` - Development guide for AI agents

**External Resources:**

- [Bun Documentation](https://bun.sh/docs) - Runtime and bundler docs
- [Bun.build() API](https://bun.sh/docs/bundler) - Bundler configuration
- [API Extractor](https://api-extractor.com/) - Declaration bundling
- [TSDoc](https://tsdoc.org/) - Documentation comment syntax

---

**Document Status:** Current - Core architecture document. Build lifecycle,
configuration reference, API model options, and testing strategy have been
extracted to dedicated files for focused reference.
