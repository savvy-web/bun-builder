---
status: current
module: bun-builder
category: architecture
created: 2026-01-26
updated: 2026-01-26
last-synced: 2026-01-26
completeness: 95
related: []
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
transformation, and multi-target builds.

**Key Design Principles:**

- **Native performance**: Leverage Bun's native bundler for fast builds
- **Automatic configuration**: Auto-detect entries from package.json exports
- **Multi-target support**: Single configuration produces dev and npm builds
- **Declaration bundling**: tsgo + API Extractor for rolled-up .d.ts files
- **Catalog resolution**: Support for Bun's `catalog:` and `workspace:` protocols
- **Self-building**: The package builds itself using BunLibraryBuilder

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
- Detect build target from `--env-mode` CLI argument
- Orchestrate build lifecycle for each target
- Inject package version at compile time via Bun macro
- Report build results and timing

**Key interfaces/APIs:**

```typescript
class BunLibraryBuilder {
  // Factory method - recommended entry point
  static async create(options?: BunLibraryBuilderOptions): Promise<BuildResult[]>

  // Instance methods
  constructor(options?: BunLibraryBuilderOptions)
  async run(targets?: BuildTarget[]): Promise<BuildResult[]>
  async build(target: BuildTarget): Promise<BuildResult>
}

type BuildTarget = "dev" | "npm";
```

**Dependencies:**

- Depends on: Build lifecycle hooks, logger utilities, version macro
- Used by: Consumer `bun.config.ts` files

#### Component 2: Build Lifecycle

**Location:** `src/hooks/build-lifecycle.ts`

**Purpose:** Core build orchestration implementing all build phases.

**Key Functions:**

| Function              | Purpose                                |
|-----------------------|----------------------------------------|
| `executeBuild()`      | Main orchestrator running all phases   |
| `runTsDocLint()`      | Pre-build TSDoc validation             |
| `runBunBuild()`       | Execute Bun.build() bundling           |
| `runTsgoGeneration()` | Generate .d.ts with tsgo               |
| `runApiExtractor()`   | Bundle declarations with API Extractor |
| `writePackageJson()`  | Transform and write package.json       |
| `copyFiles()`         | Copy additional assets to output       |

**Build Context Interface:**

```typescript
interface BuildContext {
  cwd: string;                    // Project root
  target: BuildTarget;            // "dev" or "npm"
  options: BunLibraryBuilderOptions;
  outdir: string;                 // e.g., "dist/npm"
  entries: Record<string, string>; // Entry name -> source path
  version: string;                // Package version
  packageJson: PackageJson;       // Original package.json
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

```typescript
class EntryExtractor {
  constructor(options?: EntryExtractorOptions)
  extract(packageJson: PackageJson): ExtractedEntries
}

interface ExtractedEntries {
  entries: Record<string, string>;  // "index" -> "./src/index.ts"
}
```

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

```typescript
class BunCatalogResolver {
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

#### Component 5: Package.json Transformer

**Location:** `src/plugins/utils/package-json-transformer.ts`

**Purpose:** Transform package.json for build output with path updates and
catalog resolution.

**Key Functions:**

| Function                      | Purpose                                 |
|-------------------------------|-----------------------------------------|
| `transformExportPath()`       | Strip src/ prefix, convert .ts to .js   |
| `createTypePath()`            | Create .d.ts path from .js path         |
| `transformPackageBin()`       | Transform bin field paths               |
| `transformPackageExports()`   | Recursively transform exports field     |
| `applyBuildTransformations()` | Apply all RSlib-style transformations   |
| `resolveCatalogReferences()`  | Resolve catalog: and workspace: refs    |
| `buildPackageJson()`          | Complete transformation pipeline        |

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

#### Component 8: Logger Utilities

**Location:** `src/plugins/utils/logger.ts`

**Purpose:** RSlib-style logging with colored output and environment awareness.

**Key Features:**

- Test environment detection (auto-suppress output)
- CI environment detection (for strict error handling)
- Timer utilities for build duration tracking
- File size formatting
- File table output (RSlib style)
- Environment-tagged logger for build targets

```typescript
// Basic logger with bracketed prefix
const logger = createLogger("tsdoc-lint");
logger.info("Validating...");  // info    [tsdoc-lint] Validating...

// Environment-aware logger with target context
const envLogger = createEnvLogger("npm");
envLogger.info("Building...");  // info    [npm] Building...
envLogger.global.info("Global");  // info    Global
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
|              Target Resolution Layer                        |
|    - Parse --env-mode from CLI                              |
|    - Use options.targets or default to ["dev", "npm"]       |
|    - Sequential target execution                            |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|              Build Lifecycle Orchestration                  |
|    executeBuild(options, target)                            |
|                                                             |
|    1. Setup (read pkg, extract entries, create outdir)      |
|    2. TSDoc Lint (optional pre-build validation)            |
|    3. Bun.build() (bundle source files)                     |
|    4. tsgo (generate declarations)                          |
|    5. API Extractor (bundle declarations)                   |
|    6. Copy files (README, LICENSE, assets)                  |
|    7. Transform files (user callback)                       |
|    8. Write package.json (with files array)                 |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|              Utility Modules Layer                          |
|    - EntryExtractor: Parse package.json exports/bin         |
|    - BunCatalogResolver: Resolve catalog:/workspace:        |
|    - Package.json transformer: Path transformations         |
|    - TSConfigs: Manage tsconfig for declaration gen         |
|    - Logger: RSlib-style colored output                     |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|              External Tools Layer                           |
|    - Bun.build(): Native bundler                            |
|    - tsgo: Fast TypeScript declaration generation           |
|    - API Extractor: Declaration bundling + API model        |
+-------------------------------------------------------------+
```

### Build Targets

Two build targets with different optimizations:

| Target | Source Maps | Minify | API Model | Output Directory | Private |
|--------|-------------|--------|-----------|------------------|---------|
| `dev`  | linked      | false  | false     | `dist/dev/`      | true    |
| `npm`  | none        | false  | true*     | `dist/npm/`      | false** |

*API model only if `apiModel` option enabled
**Based on `publishConfig.access` in source package.json

Targets selected via `--env-mode`:

```bash
bun run bun.config.ts --env-mode dev
bun run bun.config.ts --env-mode npm
bun run bun.config.ts  # Builds both
```

### Current Limitations

- **Sequential target builds**: Targets are built one at a time
- **Single entry declaration bundling**: API Extractor only bundles the main
  entry point declarations
- **No watch mode**: Full rebuild required on changes
- **Workspace resolution limited**: Only checks `packages/<name>` paths

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

- **Where used:** Target-specific build configuration
- **Why used:** Different settings for dev vs npm builds
- **Implementation:** Conditional logic in `executeBuild()` based on target

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

- Resolve build targets from CLI or options
- Execute build lifecycle for each target
- Aggregate and report results

**Components:**

- `BunLibraryBuilder.run()`
- `executeBuild()`

**Communication:** Sequential target execution

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
│   ├── index.ts                 # Main exports
│   ├── builders/
│   │   └── bun-library-builder.ts  # Main builder class
│   ├── hooks/
│   │   └── build-lifecycle.ts   # Build phase implementations
│   ├── plugins/
│   │   └── utils/
│   │       ├── entry-extractor.ts        # Entry detection
│   │       ├── catalog-resolver.ts       # Catalog resolution
│   │       ├── package-json-transformer.ts # Pkg transformations
│   │       ├── file-utils.ts             # FS utilities
│   │       └── logger.ts                 # Logging utilities
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
executeBuild(options, target)
         |
         v
+----------------------------------------+
| 1. SETUP                               |
|    - Read package.json                 |
|    - Extract version                   |
|    - Extract entry points              |
|    - Log auto-detected entries         |
|    - Create output directory           |
+----------------------------------------+
         |
         v
+----------------------------------------+
| 2. TSDOC LINT (optional)               |
|    - Skip if tsdocLint disabled        |
|    - Dynamic import ESLint + plugins   |
|    - Lint entry point files            |
|    - Handle errors based on onError    |
+----------------------------------------+
         |
         v
+----------------------------------------+
| 3. BUN BUILD                           |
|    - Convert entries to absolute paths |
|    - Configure Bun.build() options     |
|    - Execute bundling                  |
|    - Track outputs for files array     |
+----------------------------------------+
         |
         v
+----------------------------------------+
| 4. DECLARATION GENERATION              |
|    - Create temp declaration directory |
|    - Remove stale .tsbuildinfo files   |
|    - Generate temp tsconfig            |
|    - Run tsgo --declaration            |
+----------------------------------------+
         |
         v
+----------------------------------------+
| 5. DECLARATION BUNDLING                |
|    - Validate API Extractor installed  |
|    - Find main entry declaration       |
|    - Configure API Extractor           |
|    - Bundle to single index.d.ts       |
|    - Optionally generate API model     |
|    - Fallback: copy unbundled .d.ts    |
+----------------------------------------+
         |
         v
+----------------------------------------+
| 6. COPY FILES                          |
|    - Auto-add public/ directory        |
|    - Auto-add README.md, LICENSE       |
|    - Process copyPatterns option       |
|    - Track copied files                |
+----------------------------------------+
         |
         v
+----------------------------------------+
| 7. TRANSFORM FILES (optional)          |
|    - Call transformFiles callback      |
|    - Allow user post-processing        |
|    - Modify files array if needed      |
+----------------------------------------+
         |
         v
+----------------------------------------+
| 8. WRITE PACKAGE.JSON                  |
|    - Resolve catalog references (npm)  |
|    - Transform export paths            |
|    - Apply user transform function     |
|    - Set private flag for dev          |
|    - Add files array                   |
|    - Write to output directory         |
+----------------------------------------+
         |
         v
    Return BuildResult
```

### Phase Details

#### Phase 1: Setup

**Inputs:**

- `options`: BunLibraryBuilderOptions
- `target`: "dev" | "npm"

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

**Inputs:**

- `BuildContext`
- `TsDocLintOptions` (from `options.tsdocLint`)

**Operations:**

1. Check if enabled (skip if `enabled: false`)
2. Dynamic import ESLint and plugins
3. Discover files from entry points
4. Configure ESLint with tsdoc rules
5. Run linting on files
6. Count errors and warnings
7. Handle based on `onError` setting

**Error Handling:**

| onError   | Behavior                  |
|-----------|---------------------------|
| `"warn"`  | Log warnings, continue    |
| `"error"` | Log errors, continue      |
| `"throw"` | Throw Error, abort build  |

Default: `"throw"` in CI, `"error"` locally

#### Phase 3: Bun Build

**Inputs:**

- `BuildContext` with entries

**Operations:**

1. Convert entry paths to absolute
2. Build externals array from options
3. Configure Bun.build():
   - `target: "node"`
   - `format: "esm"`
   - `splitting: false`
   - `sourcemap: "linked"` (dev) or `"none"` (npm)
   - `minify: false`
   - `packages: "bundle"`
4. Execute `Bun.build()`
5. Check for build success
6. Add outputs to files array (excluding .map)

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

#### Phase 5: Declaration Bundling

**Inputs:**

- `BuildContext`
- `tempDtsDir`: Directory with generated .d.ts files
- `apiModel`: ApiModelOptions or boolean

**Operations:**

1. Validate API Extractor installed
2. Find main entry point declaration file
3. Configure API Extractor:
   - `mainEntryPointFilePath`
   - `dtsRollup.enabled: true`
   - `docModel.enabled` based on apiModel option
   - `bundledPackages` from options
4. Run API Extractor
5. Handle failures by copying unbundled declarations

**Outputs:**

- `{ bundledDtsPath?, apiModelPath?, dtsFiles? }`

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
  - `target`: Build target

**Operations:**

1. Call user's `transformFiles` callback
2. Allow modifications to outputs and filesArray

**User Responsibilities:**

- Add/modify output files
- Update files array as needed

#### Phase 8: Write package.json

**Inputs:**

- `BuildContext`
- `filesArray`: Set of files

**Operations:**

1. Build user transform function wrapper
2. Call `buildPackageJson()`:
   - Resolve catalog references (npm only)
   - Apply build transformations
   - Call user transform
3. Set `private: true` for dev target
4. Add sorted files array
5. Write to `<outdir>/package.json`

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
+----------------------------------------+
         |
         v
    entries: {
      "index": "./src/index.ts",
      "utils": "./src/utils.ts",
      "bin/cli": "./src/bin/cli.ts"
    }
```

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
| Production only:                       |
| resolveCatalogReferences()             |
|   - Delegates to BunCatalogResolver    |
|   - Resolves catalog: references       |
|   - Resolves workspace: references     |
+----------------------------------------+
         |
         v
+----------------------------------------+
| applyBuildTransformations()            |
|   - Remove publishConfig, scripts      |
|   - Set private based on publishConfig |
|   - transformPackageExports()          |
|     - .ts/.tsx -> .js                  |
|     - Add types conditions             |
|     - Strip src/ prefix                |
|   - transformPackageBin()              |
|   - Transform typesVersions            |
|   - Transform files array              |
|   - Sort with sort-package-json        |
+----------------------------------------+
         |
         v
    User transform function (if provided)
         |
         v
    Add files array from build
         |
         v
    Write to dist/<target>/package.json
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
    .bun-builder/declarations/{target}/*.d.ts
         |
         v
+----------------------------------------+
| API Extractor                          |
|   - Find main entry .d.ts              |
|   - Bundle all declarations            |
|   - Optional: Generate API model       |
+----------------------------------------+
         |
         v
    dist/{target}/index.d.ts
    dist/{target}/<pkg>.api.json (if apiModel)
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
  targets?: BuildTarget[];            // ["dev", "npm"] default
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

  // Documentation
  apiModel?: ApiModelOptions | boolean; // API model generation
  tsdocLint?: TsDocLintOptions | boolean; // Pre-build TSDoc validation
}
```

### Build Target Differences

| Option             | dev        | npm                    |
|--------------------|------------|------------------------|
| Source maps        | `"linked"` | `"none"`               |
| Minify             | `false`    | `false`                |
| API model          | `false`    | Per option             |
| Catalog resolution | No         | Yes                    |
| `private` field    | `true`     | Based on publishConfig |

### ApiModelOptions

```typescript
interface ApiModelOptions {
  enabled?: boolean;           // Default: false
  filename?: string;           // Default: "<pkg>.api.json"
  localPaths?: string[];       // Copy API model to these paths
  tsdoc?: TsDocOptions;        // Custom TSDoc configuration
  tsdocMetadata?: TsDocMetadataOptions | boolean;
}
```

### TsDocLintOptions

```typescript
interface TsDocLintOptions {
  enabled?: boolean;           // Default: true when option provided
  tsdoc?: TsDocOptions;        // Custom TSDoc configuration
  include?: string[];          // Override file discovery
  onError?: "warn" | "error" | "throw"; // Default: throw in CI
  persistConfig?: boolean | string;     // Keep tsdoc.json
}
```

### CopyPatternConfig

```typescript
interface CopyPatternConfig {
  from: string;                // Source path
  to?: string;                 // Destination (default: "./")
  noErrorOnMissing?: boolean;  // Suppress missing file warnings
}
```

---

## Integration Points

### Bun Build Integration

```typescript
const result = await Bun.build({
  entrypoints: absoluteEntryPaths,
  outdir: context.outdir,
  target: "node",
  format: "esm",
  splitting: false,
  sourcemap: target === "dev" ? "linked" : "none",
  minify: false,
  external: externalPackages,
  packages: "bundle",
  naming: "[name].[ext]",
  define: {
    "process.env.__PACKAGE_VERSION__": JSON.stringify(version),
    ...userDefine,
  },
  plugins: userPlugins,
});
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

### API Extractor Integration

```typescript
const extractorConfig = ExtractorConfig.prepare({
  configObject: {
    projectFolder: cwd,
    mainEntryPointFilePath: tempDtsPath,
    compiler: { tsconfigFilePath },
    dtsRollup: {
      enabled: true,
      untrimmedFilePath: bundledDtsPath,
    },
    docModel: apiModelEnabled ? {
      enabled: true,
      apiJsonFilePath: apiModelPath,
    } : { enabled: false },
    bundledPackages: dtsBundledPackages,
  },
  packageJsonFullPath: join(cwd, "package.json"),
});

Extractor.invoke(extractorConfig, { localBuild: true });
```

### External Dependencies

**Build Tools:**

- **bun**: Native runtime and bundler

**Type Generation:**

- **@typescript/native-preview (tsgo)**: Fast declaration generation
- **@microsoft/api-extractor**: Declaration bundling, API model generation
- **typescript**: TypeScript compiler API for config parsing

**TSDoc Validation:**

- **eslint**: ESLint core for programmatic linting
- **@typescript-eslint/parser**: TypeScript parser for ESLint
- **eslint-plugin-tsdoc**: TSDoc validation rules

**Package.json Processing:**

- **sort-package-json**: Consistent field ordering

**Utilities:**

- **picocolors**: Terminal coloring
- **glob**: File pattern matching
- **tmp**: Temporary file creation

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
- **Parallel target builds**: Build dev and npm concurrently

### Phase 2: Medium-term

- **Multi-entry declaration bundling**: API Extractor for all entries
- **Source map preservation**: Optional .map file distribution
- **JSR target support**: Publish to JavaScript Registry

### Phase 3: Long-term

- **Monorepo support**: Build multiple packages in workspace
- **Remote caching**: Share build cache across CI runs
- **Plugin system**: User-defined build phases

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

**Document Status:** Current - Core architecture documented with all components

**Next Steps:** Add integration examples, document edge cases in transformation
pipeline
