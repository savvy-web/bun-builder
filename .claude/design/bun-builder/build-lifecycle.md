---
status: current
module: bun-builder
category: architecture
created: 2026-02-26
updated: 2026-02-27
last-synced: 2026-02-27
completeness: 95
related:
  - bun-builder/architecture.md
  - bun-builder/configuration-reference.md
  - bun-builder/api-model-options.md
  - bun-builder/testing-strategy.md
dependencies: []
---

# Build Lifecycle

The 12-phase build pipeline orchestrated by `executeBuild()` in
`src/hooks/build-lifecycle.ts`. Covers both bundle and bundleless modes, tool
integrations (Bun.build, tsgo, API Extractor), and environment-aware behavior.

## Table of Contents

1. [Phase Diagram](#phase-diagram)
2. [Phase Details](#phase-details)
3. [Bundleless Mode](#bundleless-mode)
4. [Integration Points](#integration-points)
5. [Related Documentation](#related-documentation)

---

## Phase Diagram

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
|    - splitting: user option or auto    |
|      (true for multi-entry, false for  |
|       single-entry)                    |
|    - naming: object-form when splitting|
|      { entry: "[dir]/[name].[ext]",   |
|        chunk: "chunk-[hash].[ext]" }   |
|    - Execute bundling                  |
|    - Rename outputs to match entries   |
|    - Skip chunk artifacts in rename    |
|    IF bundle = false (bundleless):     |
|    - ImportGraph.traceFromEntries()    |
|    - Discover all reachable source     |
|    - Bun.build() per discovered file   |
|    - splitting: always false           |
|    - Strip src/ prefix from outputs    |
|    - Preserve source directory layout  |
|    - Track outputs for files array     |
+----------------------------------------+
         |
         v
+----------------------------------------+
| 5b. TRACE IMPORT GRAPH (DTS filter)   |
|    - ImportGraph.traceFromEntries()    |
|    - Build set of reachable .d.ts      |
|    - Used to filter test files and     |
|      non-reachable declarations        |
|    - Passed to copyUnbundledDecls and  |
|      runApiExtractor as tracedFiles    |
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
|    - Build TSDocConfigFile in-memory   |
|      via buildConfigObject() +         |
|      TSDocConfigFile.loadFromObject()  |
|      (tags from context.options, NOT   |
|       the apiModel parameter)          |
|    - Loop over ALL export entries      |
|    - Run API Extractor per entry       |
|    - enumMemberOrder: "preserve"       |
|    - Bundle per-entry .d.ts files      |
|      (or skip DTS rollup if bundleless)|
|    - Collect per-entry API models      |
|    - Collect TSDoc warnings w/ source  |
|    - Collect forgotten exports w/ src  |
|    - Collect error diagnostics         |
|    - THROW on per-entry failure        |
|      (fail-fast with error details)    |
|    - Merge models via mergeApiModels() |
|    - Rewrite canonical refs for subs   |
|    - Process TSDoc warnings (fail/log) |
|    - Handle forgottenExports option    |
|    - tsdoc-metadata: main entry only   |
|    - Generate tsconfig.json + tsdoc.json|
|    - tsdoc.json: skipCIValidation=true |
|    - Outer catch re-throws (no silent  |
|      fallback to unbundled .d.ts)      |
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
|    - Iterate over publish targets      |
|      (or once with target: undefined)  |
|    - Call transformFiles per target    |
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
| 11. COPY ARTIFACTS + WRITE PACKAGE.JSON|
|    - Iterate over publish targets      |
|      (or once with target: undefined)  |
|    - For each additional target dir:   |
|      cpSync(outdir, target.directory)  |
|    - Resolve catalog references (npm)  |
|    - Transform export paths            |
|    - Apply format option to transform  |
|    - Apply user transform function     |
|    - Set private flag for dev          |
|    - Add files array                   |
|    - Write to target dir (or outdir)   |
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

---

## Phase Details

### Phase 1: Setup

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
8. Resolve publish targets via `resolvePublishTargets()`
9. Create `BuildContext` object (includes `publishTargets`)
10. Clean and create output directory

**Outputs:**

- `BuildContext` with all necessary data

### Phase 2: TSDoc Lint

**Configuration Path:** `apiModel.tsdoc.lint`

TSDoc lint is configured as a nested property of `apiModel.tsdoc`, not as a
top-level option. This means lint shares the same TSDoc tag configuration
(groups, tagDefinitions, supportForTags) as API Extractor, so tags are defined
once.

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
5. Discover files using `ImportGraph.traceFromPackageExports()` or explicit
   `include`
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

### Phase 3: Bun Build

The build mode is determined by `options.bundle` (default: `true`).

**Bundle Mode (`bundle !== false`, default):**

1. Convert entry paths to absolute
2. Build externals array from options
3. Resolve `splitting`: `options.splitting ?? (entryCount > 1)`
   - Defaults to `true` for multi-entry, `false` for single-entry
   - When splitting is enabled, uses object-form `naming`:
     `{ entry: "[dir]/[name].[ext]", chunk: "chunk-[hash].[ext]" }`
   - When splitting is disabled, uses string-form `naming`:
     `"[dir]/[name].[ext]"`
4. Configure Bun.build() (see [Bun Build Integration](#bun-build-integration))
5. Execute `Bun.build()`
6. Post-process: rename outputs to match entry names
   - Chunk artifacts (`output.kind === "chunk"`) are skipped in the rename
     loop since they have content-hash names
7. Clean up empty directories after renaming
8. Add outputs to files array (excluding .map)

**Bundleless Mode (`bundle: false`):**

See [Bundleless Mode](#bundleless-mode) for details.

**Outputs:**

- `{ outputs: BuildArtifact[], success: boolean }`

### Phase 3b: Import Graph Tracing (DTS Filtering)

After the Bun build phase completes (and before declaration generation), the
import graph is traced from entry points to build an allowlist of reachable
source files. This ensures that test files (e.g., `*.test.ts`) and other
non-reachable source files are excluded from declaration output.

**Operations:**

1. Create `ImportGraph` with `rootDir: cwd`
2. Call `traceFromEntries()` with all entry point paths
3. Convert traced file paths to `.d.ts` equivalents using
   `relative(cwd, f).replace(/\.tsx?$/, ".d.ts")`
4. Build a `Set<string>` of allowed `.d.ts` filenames (`tracedFiles`)

**Usage:** The `tracedFiles` set is passed to:

- `copyUnbundledDeclarations(context, tempDtsDir, tracedFiles)` - Only copies
  `.d.ts` files in the allowlist (used in bundleless mode)
- `runApiExtractor(context, tempDtsDir, apiModel, { tracedFiles })` - Used
  when API Extractor is not installed to copy unbundled declarations as a
  fallback; in normal operation, `runApiExtractor` throws on failure (fail-fast)
  rather than silently falling back to unbundled declarations

### Phase 4: Declaration Generation

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

### Phase 5: Declaration Bundling (Multi-Entry)

**Architecture:**

API Extractor runs once per export entry point (bin entries are skipped). Each
run produces a per-entry bundled `.d.ts` file and optionally a per-entry API
model JSON. The per-entry models are then merged into a single Package with
multiple EntryPoint members.

In bundleless mode (`options.bundleless: true`), DTS rollup is disabled
(`dtsRollup: { enabled: false }`) and API Extractor runs only for `.api.json`
generation when `apiModel` is enabled.

**Error Handling -- Fail-Fast:**

`runApiExtractor()` throws on per-entry failure with collected error
diagnostics formatted with source location info. The outer catch in
`runApiExtractor()` re-throws the error (no silent fallback to copying
unbundled declarations). `executeBuild()` wraps the call in a try-catch and
returns `{ success: false, errors: [new Error(errorMessage)] }` which
`BunLibraryBuilder.run()` then logs.

**TSDoc Config -- In-Memory Loading:**

Instead of writing `tsdoc.json` to disk before API Extractor runs, the
config is built in-memory using `TsDocConfigBuilder.buildConfigObject()` +
`TSDocConfigFile.loadFromObject()`. Tag definitions come from
`context.options.apiModel.tsdoc` (the builder's options), NOT the `apiModel`
parameter passed to `runApiExtractor()`. The parameter controls whether to
generate `.api.json` output; tag definitions are needed regardless for DTS
rollup. The on-disk `tsdoc.json` is only persisted after a successful build.

**Operations:**

1. Validate API Extractor installed
2. Filter to export entries only (skip `bin/` entries)
3. Resolve API model configuration using `ApiModelConfigResolver`
4. Resolve `forgottenExports` behavior (`"include"` local, `"error"` CI)
5. Resolve `tsdoc.warnings` behavior (`"fail"` in CI, `"log"` locally, `"none"`)
6. Build `TSDocConfigFile` in-memory:
   - If `context.options.apiModel.tsdoc` is configured:
     `TsDocConfigBuilder.buildConfigObject(tsdocOptions)` produces the
     complete tsdoc.json config, loaded via
     `TSDocConfigFile.loadFromObject(configObject)`
   - Otherwise: fall back to `TSDocConfigFile.loadForFolder(cwd)` to load
     the project's existing `tsdoc.json` (if present and valid)
   - This avoids writing `tsdoc.json` to disk before the build, ensuring
     that tags work in both dev and npm modes
7. For each export entry:
   a. Find declaration file via `resolveDtsPath()`
   b. Configure API Extractor with entry-specific paths:
      - `enumMemberOrder: "preserve"`
      - `dtsRollup`: enabled in bundle mode, disabled in bundleless mode
      - `tsdocMetadata`: only generated for main entry (`entryName === "index"`
        or single entry)
   c. Pass loaded `tsdocConfigFile` to `ExtractorConfig.prepare()`
   d. Run API Extractor (per-entry `.d.ts` + optional temp API model)
   e. Collect TSDoc warnings with source location info (`sourceFilePath`,
      `sourceFileLine`, `sourceFileColumn`)
   f. Collect forgotten export messages with source location info
   g. Collect error/warning diagnostics into `collectedErrors`
   h. Read per-entry API model for merging (done before success check since
      docModel JSON is generated even when DTS rollup fails)
   i. **Throw** on per-entry failure with formatted error details from
      `collectedErrors`
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
12. Persist tsdoc.json to output directory with `skipCIValidation=true`
    (dist tsdoc.json is a generated build artifact, not a version-controlled
    config file, so CI validation is inappropriate)
13. Outer catch re-throws errors; `executeBuild()` catches and returns
    `{ success: false, errors }`

**Generated Files (when enabled):**

- `<entry>.d.ts` - Per-entry bundled TypeScript declarations (bundle mode only)
- `<package>.api.json` - Merged API model with multiple EntryPoint members
- `tsdoc-metadata.json` - TSDoc custom tag definitions (main entry only)
- `tsconfig.json` - Resolved tsconfig for virtual TypeScript environments
- `tsdoc.json` - TSDoc tag configuration for documentation tools

### Phase 6: Copy Files

**Auto-added patterns:**

1. `./src/public/` or `./public/` (if exists)
2. `README.md` (if exists)
3. `LICENSE` (if exists)

**Operations:**

1. Process each pattern
2. Resolve source and destination paths
3. Copy files/directories
4. Track copied files for files array

### Phase 7: Transform Files

**Inputs:**

- `TransformFilesContext`:
  - `outputs`: Map of filename to content
  - `filesArray`: Set of files to publish
  - `mode`: Build mode (`BuildMode`)
  - `target`: Publish target (`PublishTarget | undefined`)

**Operations:**

1. Build targets list: `context.publishTargets` if non-empty,
   otherwise `[undefined]`
2. For each publish target:
   - Call user's `transformFiles` callback with current target
   - Allow modifications to outputs and filesArray

When no `publishConfig.targets` are configured, the callback is called once with
`target: undefined` (backward compatible).

### Phase 8: Virtual Entries

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

### Phase 9: Copy Artifacts + Write package.json

**Operations:**

1. Build targets list: `context.publishTargets` if non-empty,
   otherwise `[undefined]`
2. For each publish target:
   a. If the target's directory differs from `context.outdir`, copy ALL build
      artifacts (JS bundles, .d.ts files, LICENSE, README, etc.) from `outdir`
      to the target directory using `cpSync(context.outdir,
      publishTarget.directory, { recursive: true })`
   b. Wrap user `transform` function with current publish target in context
   c. Call `PackageJsonTransformer.build()`:
      - Resolve catalog references (npm only)
      - Apply build transformations
      - Call user transform (receives `{ mode, target, pkg }`)
   d. Set `private: true` for dev mode
   e. Add sorted files array
   f. Write to publish target's directory (or `<outdir>/package.json` when
      no target)

### Phase 10: Copy to Local Paths (npm mode only)

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

## Bundleless Mode

When `bundle: false`, the build preserves source directory structure instead of
producing single-file bundles per entry.

### Bundleless Build Phase

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

### Bundleless Declaration Handling

After tsgo generates raw `.d.ts` files, they are copied directly to the output
directory without DTS rollup (no API Extractor declaration bundling). API
Extractor still runs for `.api.json` generation only if `apiModel` is enabled,
with `dtsRollup: { enabled: false }`.

### Mode Comparison

| Aspect | Bundle Mode | Bundleless Mode |
| --- | --- | --- |
| Output structure | Single file per entry (+ chunks if splitting) | Preserves source tree |
| Code splitting | `splitting` option (auto: multi=true, single=false) | Always `false` |
| File discovery | Entry points only | ImportGraph traces all reachable |
| Bun.build() | Standard bundling | Per-file compilation |
| Declarations | API Extractor DTS rollup (fail-fast) | Raw tsgo `.d.ts` files |
| API model | Per-entry + merge | Per-entry + merge (no DTS) |
| Tree shaking | Yes | No |

---

## Integration Points

### Bun Build Integration

**Bundle mode** (`bundle !== false`, default):

```typescript
const hasMultipleEntries = Object.keys(context.entries).length > 1;
const splitting = context.options.splitting ?? hasMultipleEntries;

const result = await Bun.build({
  entrypoints: absoluteEntryPaths,
  outdir: context.outdir,
  target: context.options.bunTarget ?? "bun",
  format: context.options.format ?? "esm",
  splitting,
  sourcemap: mode === "dev" ? "linked" : "none",
  minify: false,
  external: externalPackages,
  packages: "external",
  // When splitting is enabled, use object-form naming to control chunk filenames.
  naming: splitting
    ? { entry: "[dir]/[name].[ext]", chunk: "chunk-[hash].[ext]" }
    : "[dir]/[name].[ext]",
  define: {
    "process.env.__PACKAGE_VERSION__": JSON.stringify(version),
    ...userDefine,
  },
  plugins: userPlugins,
});

// Post-process: rename outputs to match entry names.
// Chunk artifacts (output.kind === "chunk") are skipped — they have
// content-hash names and don't need renaming.
```

**Bundleless mode** (`bundle: false`):

```typescript
// Discover all reachable source files from entry points
const graph = new ImportGraph({ rootDir: context.cwd });
const traceResult = graph.traceFromEntries(entryPaths);

const result = await Bun.build({
  entrypoints: traceResult.files,
  outdir: context.outdir,
  target: context.options.bunTarget ?? "bun",
  format: context.options.format ?? "esm",
  splitting: false,  // Always false in bundleless mode
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
// Build TSDocConfigFile in-memory from builder config (no disk write needed).
// Tag definitions come from context.options.apiModel.tsdoc, NOT the apiModel
// parameter — the parameter controls .api.json output; tags are always needed.
const { TSDocConfigFile } = await import("@microsoft/tsdoc-config");
const tsdocOptions = context.options.apiModel?.tsdoc;

let tsdocConfigFile;
if (tsdocOptions) {
  const configObject = TsDocConfigBuilder.buildConfigObject(tsdocOptions);
  tsdocConfigFile = TSDocConfigFile.loadFromObject(configObject);
} else {
  // Fall back to project's existing tsdoc.json
  const loaded = TSDocConfigFile.loadForFolder(context.cwd);
  if (!loaded.fileNotFound && !loaded.hasErrors) {
    tsdocConfigFile = loaded;
  }
}

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
      apiJsonFilePath: perEntryApiModelPath,
    } : { enabled: false },
    tsdocMetadata: isMainEntry
      ? { enabled: true, tsdocMetadataFilePath: ... }
      : { enabled: false },
    bundledPackages: dtsBundledPackages,
  },
  packageJsonFullPath: join(cwd, "package.json"),
  tsdocConfigFile,
});

Extractor.invoke(extractorConfig, {
  localBuild: true,
  messageCallback: (message) => {
    // Collect TSDoc warnings with source location info
    // Collect ae-forgotten-export messages with source location info
    // Collect error/warning diagnostics into collectedErrors
    // Suppress TypeScript version and signature change warnings
  },
});

// Fail-fast: throw on per-entry failure with collected error diagnostics
if (!extractorResult.succeeded) {
  throw new Error(`API Extractor failed for entry "${entryName}": ${errorDetails}`);
}

// After all entries processed:
// 1. Process TSDoc warnings (first-party vs third-party, fail/log/none)
// 2. Process forgotten exports (error/include/ignore)
// 3. Merge API models
const merged = mergeApiModels({
  perEntryModels,
  packageName: '@scope/package',
  exportPaths: context.exportPaths,
});
// 4. Persist tsdoc.json to dist (on-disk write only after success)
```

### tsdoc.json Persistence

**In-memory loading for API Extractor:** During the DTS rollup phase, the
TSDoc config is built in-memory via `TsDocConfigBuilder.buildConfigObject()`
and loaded via `TSDocConfigFile.loadFromObject()`. No `tsdoc.json` is written
to disk before the build runs. This ensures tag definitions work in both dev
and npm modes since the config comes from `context.options.apiModel.tsdoc`
rather than from a file that might not exist yet.

**Dist output (`skipCIValidation = true`):** The `tsdoc.json` written to the
dist output directory uses `skipCIValidation = true` when calling
`TsDocConfigBuilder.writeConfigFile()`. This is because the dist `tsdoc.json`
is a generated build artifact that should always be written fresh, unlike the
project-root `tsdoc.json` which is committed to version control and validated
in CI to ensure it stays in sync with build options.

**Project-root persist fix:** The tsdoc.json persist-to-project-root step
checks `lintActuallyRan` (which is `lintEnabled AND lintConfig !== undefined`)
rather than just `lintEnabled`. Previously, `lintEnabled` was `true` even when
`lintConfig` was `undefined` (because lint never actually ran), which
incorrectly skipped the persist step. Now the persist step correctly runs when
lint did not execute.

### CI Detection

`BuildLogger.isCI()` checks for common CI environment indicators, accepting
both `"true"` and `"1"` values:

- `CI=true` or `CI=1`
- `GITHUB_ACTIONS=true` or `GITHUB_ACTIONS=1`

`TsDocConfigBuilder.isCI()` delegates to `BuildLogger.isCI()` for consistent
CI detection across the codebase. CI detection affects:

- TSDoc warnings default behavior (`"fail"` in CI, `"log"` locally)
- Forgotten exports default behavior (`"error"` in CI, `"include"` locally)
- TSDoc lint `onError` default (`"throw"` in CI, `"error"` locally)
- Local path copying (skipped in CI)
- tsdoc.json persistence (validate-only in CI, write locally)

### External Dependencies

**Build Tools:**

- **bun**: Native runtime and bundler

**Type Generation:**

- **@typescript/native-preview (tsgo)**: Fast declaration generation
- **@microsoft/api-extractor**: Declaration bundling, API model generation
- **@microsoft/tsdoc-config**: TSDocConfigFile loading for API Extractor
- **typescript**: TypeScript compiler API for config parsing

**TSDoc Validation:**

- **eslint**: ESLint 10 core for programmatic linting
- **@typescript-eslint/parser**: TypeScript parser for ESLint
- **eslint-plugin-tsdoc**: TSDoc validation rules (0.5.2+, ESLint 10 compatible)

**Package.json Processing:**

- **sort-package-json**: Consistent field ordering

**Utilities:**

- **picocolors**: Terminal coloring

Note: File pattern matching uses `Bun.Glob().scan()` (requires `dot: true`
option for dotfiles). Temporary files use `os.tmpdir()` +
`crypto.randomUUID()` instead of external packages.

---

## Related Documentation

**Internal Design Docs:**

- [Architecture](./architecture.md) - Core design, components, data flow
- [Configuration Reference](./configuration-reference.md) - Builder options
- [API Model Options](./api-model-options.md) - API model configuration
- [Testing Strategy](./testing-strategy.md) - Test organization and E2E

**External Resources:**

- [Bun.build() API](https://bun.sh/docs/bundler) - Bundler configuration
- [API Extractor](https://api-extractor.com/) - Declaration bundling
- [TSDoc](https://tsdoc.org/) - Documentation comment syntax

---

**Document Status:** Current - Extracted from architecture.md. Covers all 12
build phases, bundleless mode, code splitting (`splitting` option with auto
defaults), fail-fast DTS rollup error handling, in-memory TSDoc config loading
via `buildConfigObject()` + `TSDocConfigFile.loadFromObject()`, tool
integrations, CI detection (`isCI()` checks `"true"` and `"1"`),
`skipCIValidation` for dist tsdoc.json, forgotten exports handling,
ImportGraph-based DTS filtering, and `tsdoc.json` persist fix
(`lintActuallyRan` check).
