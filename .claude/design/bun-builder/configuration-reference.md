---
status: current
module: bun-builder
category: reference
created: 2026-02-26
updated: 2026-02-27
last-synced: 2026-02-27
completeness: 95
related:
  - bun-builder/architecture.md
  - bun-builder/build-lifecycle.md
  - bun-builder/api-model-options.md
dependencies: []
---

# Configuration Reference

Complete reference for `BunLibraryBuilderOptions` and related configuration
types. For API model configuration details, see
[API Model Options](./api-model-options.md).

## Table of Contents

1. [BunLibraryBuilderOptions](#bunlibrarybuilderoptions)
2. [Build Mode Differences](#build-mode-differences)
3. [Publish Targets](#publish-targets)
4. [Supporting Types](#supporting-types)
5. [Related Documentation](#related-documentation)

---

## BunLibraryBuilderOptions

```typescript
interface BunLibraryBuilderOptions {
  // Entry point configuration
  entry?: Record<string, string>;
  exportsAsIndexes?: boolean;

  // Output configuration
  targets?: BuildMode[];
  format?: "esm" | "cjs";
  bundle?: boolean;
  splitting?: boolean;
  bunTarget?: "bun" | "node" | "browser";
  copyPatterns?: (string | CopyPatternConfig)[];

  // Bundling configuration
  externals?: (string | RegExp)[];
  plugins?: BunPlugin[];
  define?: Record<string, string>;

  // TypeScript configuration
  tsconfigPath?: string;
  dtsBundledPackages?: string[];

  // Transformation hooks
  transform?: TransformPackageJsonFn;
  transformFiles?: TransformFilesCallback;

  // Documentation and API model (TSDoc lint nested here)
  apiModel?: ApiModelOptions | boolean;

  // Virtual entries (bundled but not exported, no types)
  virtualEntries?: Record<string, VirtualEntryConfig>;
}
```

**Default options** (from `BunLibraryBuilder.DEFAULT_OPTIONS`):

- `apiModel: true` - API model generation enabled by default
- `bundle: true` - Bundled output mode by default

### Option Details

#### `entry`

| Property | Value |
| --- | --- |
| Type | `Record<string, string>` |
| Default | Auto-detected from package.json |
| Required | No |

Override auto-detected entry points. Keys are entry names, values are source
file paths.

#### `exportsAsIndexes`

| Property | Value |
| --- | --- |
| Type | `boolean` |
| Default | `false` |
| Required | No |

Use `dir/index.js` structure for export paths instead of flat file names.

#### `targets`

| Property | Value |
| --- | --- |
| Type | `BuildMode[]` |
| Default | `["dev", "npm"]` |
| Required | No |

Build modes to execute. Modes are built sequentially.

#### `format`

| Property | Value |
| --- | --- |
| Type | `"esm" \| "cjs"` |
| Default | `"esm"` |
| Required | No |

Output module format for Bun.build().

#### `bundle`

| Property | Value |
| --- | --- |
| Type | `boolean` |
| Default | `true` |
| Required | No |

When `true`, produces single-file bundles per entry point. When `false`, enables
bundleless mode: preserves source directory structure with individual file
compilation. See [Build Lifecycle - Bundleless Mode](./build-lifecycle.md#bundleless-mode).

#### `splitting`

| Property | Value |
| --- | --- |
| Type | `boolean` |
| Default | `true` for multi-entry, `false` for single-entry |
| Required | No |

Whether to enable code splitting for shared modules between entry points. When
`true`, Bun extracts shared code between multiple entry points into separate
chunk files (`chunk-[hash].js`), reducing duplication. When `false`, each entry
point is fully self-contained.

The default is auto-detected: `true` when there are multiple entry points,
`false` for single-entry builds. Only applies in bundle mode (`bundle !== false`);
bundleless mode always uses `splitting: false`.

When splitting is enabled, `Bun.build()` uses object-form `naming`:

```typescript
naming: {
  entry: "[dir]/[name].[ext]",
  chunk: "chunk-[hash].[ext]",
}
```

Chunk artifacts (`output.kind === "chunk"`) are skipped in the post-build
rename loop since they have content-hash names and do not correspond to
entry points.

```typescript
// Enable splitting for single-entry (normally auto-disabled)
BunLibraryBuilder.create({ splitting: true })

// Disable splitting for multi-entry (normally auto-enabled)
BunLibraryBuilder.create({ splitting: false })
```

#### `bunTarget`

| Property | Value |
| --- | --- |
| Type | `"bun" \| "node" \| "browser"` |
| Default | `"bun"` |
| Required | No |

Bun.build() target environment.

#### `copyPatterns`

| Property | Value |
| --- | --- |
| Type | `(string \| CopyPatternConfig)[]` |
| Default | `[]` (README.md, LICENSE, public/ auto-added) |
| Required | No |

Additional files/directories to copy to the output. README.md, LICENSE, and
`src/public/` (or `public/`) are automatically added if they exist.

#### `externals`

| Property | Value |
| --- | --- |
| Type | `(string \| RegExp)[]` |
| Default | `[]` |
| Required | No |

Dependencies to exclude from bundling. Note: `packages: "external"` is always
set, so all dependencies are external by default. Use this for additional
patterns.

#### `plugins`

| Property | Value |
| --- | --- |
| Type | `BunPlugin[]` |
| Default | `[]` |
| Required | No |

Bun bundler plugins to apply during build.

#### `define`

| Property | Value |
| --- | --- |
| Type | `Record<string, string>` |
| Default | `{}` |
| Required | No |

Build-time constants. `process.env.__PACKAGE_VERSION__` is automatically
defined.

#### `tsconfigPath`

| Property | Value |
| --- | --- |
| Type | `string` |
| Default | `"./tsconfig.json"` |
| Required | No |

Path to the TypeScript configuration file.

#### `dtsBundledPackages`

| Property | Value |
| --- | --- |
| Type | `string[]` |
| Default | `[]` |
| Required | No |

Packages whose type definitions should be bundled into the output declarations
(passed to API Extractor's `bundledPackages`).

#### `transform`

| Property | Value |
| --- | --- |
| Type | `TransformPackageJsonFn` |
| Default | `undefined` |
| Required | No |

Callback to modify the output package.json. Receives
`{ mode: BuildMode, target: PublishTarget | undefined, pkg: PackageJson }`.
Called once per publish target (or once with `target: undefined` when no targets).

#### `transformFiles`

| Property | Value |
| --- | --- |
| Type | `TransformFilesCallback` |
| Default | `undefined` |
| Required | No |

Post-build callback for file modifications. Receives `TransformFilesContext`
with `outputs`, `filesArray`, `mode`, and `target`.

#### `apiModel`

| Property | Value |
| --- | --- |
| Type | `ApiModelOptions \| boolean` |
| Default | `true` |
| Required | No |

API model and TSDoc lint configuration. See
[API Model Options](./api-model-options.md) for detailed reference.

#### `virtualEntries`

| Property | Value |
| --- | --- |
| Type | `Record<string, VirtualEntryConfig>` |
| Default | `undefined` |
| Required | No |

Non-exported files to bundle. See [VirtualEntryConfig](#virtualentryconfig).

---

## Build Mode Differences

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

Modes selected via `--env-mode`:

```bash
bun run bun.config.ts --env-mode dev
bun run bun.config.ts --env-mode npm
bun run bun.config.ts  # Builds both
```

---

## Publish Targets

The `PublishTarget` type represents a fully resolved publish destination (e.g.,
npm registry, GitHub Packages, JSR).

```typescript
type PublishProtocol = "npm" | "jsr";

interface PublishTarget {
  protocol: PublishProtocol;
  registry: string | null;
  directory: string;
  access: "public" | "restricted";
  provenance: boolean;
  tag: string;
}
```

Publish targets are resolved from `publishConfig.targets` in package.json by
`resolvePublishTargets()` and stored in `BuildContext.publishTargets`.

### Target Shorthands

| Shorthand | Protocol | Registry | Provenance |
| --- | --- | --- | --- |
| `"npm"` | `npm` | `https://registry.npmjs.org/` | `true` |
| `"github"` | `npm` | `https://npm.pkg.github.com/` | `true` |
| `"jsr"` | `jsr` | `null` | `false` |
| URL string | `npm` | the URL | `false` |

Default `access` is inherited from `publishConfig.access` (or `"restricted"`),
and default `tag` is `"latest"`.

### Publish Target Iteration

When `publishConfig.targets` is configured, the `transform`, `transformFiles`,
and `writePackageJson` phases are called once per publish target. When no
targets are configured, they are called once with `target: undefined` (backward
compatible).

---

## Supporting Types

### CopyPatternConfig

```typescript
interface CopyPatternConfig {
  from: string;
  to?: string;
  noErrorOnMissing?: boolean;
}
```

### VirtualEntryConfig

```typescript
interface VirtualEntryConfig {
  source: string;
  format?: "esm" | "cjs";
}
```

**Purpose:** Bundle files that are NOT part of the package's public exports.
Virtual entries skip declaration generation and are not added to the exports
field, but ARE included in the files array for publishing.

```typescript
virtualEntries: {
  'pnpmfile.cjs': { source: './src/pnpmfile.ts', format: 'cjs' },
  'setup.js': { source: './src/setup.ts' },
}
```

### BuildContext

```typescript
interface BuildContext {
  cwd: string;
  mode: BuildMode;
  options: BunLibraryBuilderOptions;
  outdir: string;
  entries: Record<string, string>;
  exportPaths: Record<string, string>;
  version: string;
  packageJson: PackageJson;
  publishTargets: PublishTarget[];
}
```

### TransformFilesContext

```typescript
interface TransformFilesContext {
  outputs: Map<string, string>;
  filesArray: Set<string>;
  mode: BuildMode;
  target: PublishTarget | undefined;
}
```

---

## Related Documentation

**Internal Design Docs:**

- [Architecture](./architecture.md) - Core design and component overview
- [Build Lifecycle](./build-lifecycle.md) - 12-phase pipeline details
- [API Model Options](./api-model-options.md) - API model configuration

**Source Code:**

- `src/builders/bun-library-builder.ts` - BunLibraryBuilder class
- `src/types/builder-types.ts` - Type definitions

---

**Document Status:** Current - Complete reference for BunLibraryBuilderOptions
including bundle/bundleless mode, splitting (code splitting with auto defaults),
format, bunTarget, virtualEntries, publish targets, and transformation hooks.
