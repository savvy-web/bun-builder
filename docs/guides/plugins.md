# Plugin System

rslib-builder uses a plugin architecture built on Rsbuild's plugin system.
This guide covers the built-in plugins and how to extend the build process.

## Table of Contents

- [Built-in Plugins](#built-in-plugins)
- [Plugin Execution Order](#plugin-execution-order)
- [Adding Custom Plugins](#adding-custom-plugins)
- [Rsbuild Plugin API](#rsbuild-plugin-api)
- [Shared State Between Plugins](#shared-state-between-plugins)

## Built-in Plugins

rslib-builder includes five specialized plugins that handle different aspects
of the build process.

### TsDocLintPlugin

**Purpose:** Validates TSDoc comments before build using ESLint.

**What it does:**

1. Discovers files to lint using import graph analysis (default) or explicit patterns
2. Dynamically imports ESLint with `eslint-plugin-tsdoc`
3. Generates a `tsdoc.json` configuration file
4. Runs ESLint on source files to validate TSDoc syntax
5. Reports errors with file locations and rule IDs
6. Optionally fails the build on errors (default in CI)

**Stage:** `onBeforeBuild` (runs before all other plugins)

**Required Dependencies:**

```bash
pnpm add -D eslint @typescript-eslint/parser eslint-plugin-tsdoc
```

**Configuration:**

```typescript
NodeLibraryBuilder.create({
  tsdocLint: true,  // Enable with defaults
});

// Or with options
NodeLibraryBuilder.create({
  tsdocLint: {
    onError: 'throw',      // 'warn' | 'error' | 'throw'
    persistConfig: true,   // Keep tsdoc.json for IDE integration
  },
});
```

**Automatic File Discovery:**

By default, TsDocLintPlugin uses import graph analysis to discover which files
to lint. It traces imports starting from your `package.json` exports field,
finding all TypeScript files that are part of your public API.

This means:

- Only public API files are linted (files reachable from exports)
- Internal implementation files not referenced by exports are skipped
- Test files (`*.test.ts`, `*.spec.ts`) are automatically excluded
- Files in `__test__` or `__tests__` directories are excluded

**Overriding File Discovery:**

Use the `include` option when you need to lint specific files that are not
part of the export graph, or to override automatic discovery entirely:

```typescript
NodeLibraryBuilder.create({
  tsdocLint: {
    // Override automatic discovery with explicit patterns
    include: ['src/**/*.ts', '!**/*.test.ts'],
  },
});
```

**Environment-Aware Defaults:**

| Environment | Default `onError` | Default `persistConfig` |
| :---------- | :---------------- | :---------------------- |
| Local       | `'error'`         | `true`                  |
| CI          | `'throw'`         | `false`                 |

### AutoEntryPlugin

**Purpose:** Discovers entry points from package.json exports and bin fields.

**What it does:**

- Parses the `exports` field in package.json
- Parses the `bin` field for CLI entry points
- Maps export keys to entry point names
- Resolves TypeScript source paths

**Stage:** `modifyRsbuildConfig`

**Example:** Given this package.json:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./utils": "./src/utils/index.ts"
  },
  "bin": {
    "my-cli": "./src/cli.ts"
  }
}
```

AutoEntryPlugin configures these entries:

```typescript
{
  index: './src/index.ts',
  utils: './src/utils/index.ts',
  cli: './src/cli.ts'
}
```

### DtsPlugin

**Purpose:** Generates TypeScript declarations using tsgo and API Extractor.

**What it does:**

1. Generates a temporary tsconfig for declaration generation
2. Runs `tsgo --declaration --emitDeclarationOnly` for fast generation
3. Optionally bundles declarations with API Extractor
4. Optionally generates `api.model.json` for documentation
5. Strips source map comments from final output
6. Cleans up `.d.ts.map` files

**Stages:**

- `modifyRsbuildConfig` - Load tsconfig, prepare configuration
- `pre-process` - Generate declarations with tsgo
- `summarize` - Clean up and finalize

**Configuration:**

```typescript
NodeLibraryBuilder.create({
  tsconfigPath: './tsconfig.build.json',
  dtsBundledPackages: ['picocolors'],
  apiModel: true,
});
```

### PackageJsonTransformPlugin

**Purpose:** Transforms package.json for distribution.

**What it does:**

1. Loads source package.json, README, and LICENSE
2. Resolves PNPM `catalog:` and `workspace:` references
3. Transforms export paths from `.ts` to `.js`
4. Adds `types` conditions to exports
5. Transforms `bin` field paths
6. Removes dev-only fields (scripts, publishConfig)
7. Applies user transform function

**Stages:**

- `pre-process` - Load package.json and metadata files
- `optimize` - Apply transformations
- `optimize-inline` - Finalize with custom transforms

**Transformation Pipeline:**

```text
Source package.json
        │
        ▼
┌─────────────────────────┐
│ PNPM Resolution         │
│ - catalog: → versions   │
│ - workspace: → versions │
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐
│ RSlib Transformations   │
│ - .ts → .js paths       │
│ - Add type conditions   │
│ - Transform bin paths   │
│ - Remove dev fields     │
└─────────────────────────┘
        │
        ▼
┌─────────────────────────┐
│ User Transform (opt.)   │
│ - Custom modifications  │
└─────────────────────────┘
        │
        ▼
Output package.json
```

### FilesArrayPlugin

**Purpose:** Generates the `files` array in package.json.

**What it does:**

1. Scans compiled assets (JS, declarations)
2. Excludes source maps (`.js.map`, `.d.ts.map`)
3. Includes copied files (LICENSE, README)
4. Calls user's `transformFiles` callback
5. Sets final `files` array in package.json

**Stages:**

- `additional` - Collect files from compilation
- `optimize-inline` - Write final package.json with files array

**Example output:**

```json
{
  "files": [
    "index.js",
    "index.d.ts",
    "utils/index.js",
    "utils/index.d.ts",
    "LICENSE",
    "README.md",
    "package.json"
  ]
}
```

## Plugin Execution Order

Plugins execute in a specific order across Rsbuild's processing stages:

```text
0. onBeforeBuild (Pre-compilation)
   └── TsDocLintPlugin      → Validate TSDoc comments

1. modifyRsbuildConfig
   ├── AutoEntryPlugin      → Discover entries
   └── DtsPlugin            → Load tsconfig

2. processAssets: pre-process
   ├── PackageJsonTransformPlugin → Load files
   └── DtsPlugin                  → Generate .d.ts

3. processAssets: optimize
   └── PackageJsonTransformPlugin → Transform package.json

4. processAssets: additional
   ├── FilesArrayPlugin     → Collect files
   └── (User transformFiles callback)

5. processAssets: optimize-inline
   ├── PackageJsonTransformPlugin → Apply user transform
   └── FilesArrayPlugin           → Write package.json

6. processAssets: summarize
   └── DtsPlugin → Clean up .d.ts files

7. onCloseBuild (Post-compilation)
   └── TsDocLintPlugin      → Cleanup temp tsdoc.json
```

## Adding Custom Plugins

Add Rsbuild plugins via the `plugins` option:

```typescript
import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';
import { myCustomPlugin } from './my-plugin.js';

export default NodeLibraryBuilder.create({
  plugins: [
    myCustomPlugin(),
  ],
});
```

Custom plugins run after built-in plugins in each stage.

### Writing a Custom Plugin

```typescript
import type { RsbuildPlugin } from '@rsbuild/core';

export function myCustomPlugin(): RsbuildPlugin {
  return {
    name: 'my-custom-plugin',

    setup(api) {
      // Modify configuration before build
      api.modifyRsbuildConfig((config) => {
        console.log('Modifying config...');
        return config;
      });

      // Process assets during build
      api.processAssets(
        { stage: 'additional' },
        async ({ compilation, sources }) => {
          // Add a custom file
          compilation.emitAsset(
            'VERSION',
            new sources.OriginalSource('1.0.0', 'VERSION'),
          );
        },
      );
    },
  };
}
```

## Rsbuild Plugin API

rslib-builder plugins use the Rsbuild plugin API. Key methods:

### api.modifyRsbuildConfig()

Modify configuration before compilation:

```typescript
api.modifyRsbuildConfig((config) => {
  config.output.minify = false;
  return config;
});
```

### api.processAssets()

Process assets at specific stages:

```typescript
api.processAssets(
  { stage: 'optimize' },
  async ({ compilation, sources }) => {
    // Access and modify assets
    const asset = compilation.assets['index.js'];
    const source = asset.source();
  },
);
```

**Available stages:**

| Stage | When | Use For |
| :---- | :--- | :------ |
| `pre-process` | Before optimizations | Generate files |
| `optimize` | During optimization | Transform content |
| `additional` | After optimization | Add extra files |
| `optimize-inline` | Final optimization | Last-minute changes |
| `summarize` | Cleanup | Remove temp files |

### api.expose() / api.useExposed()

Share data between plugins:

```typescript
// In plugin A
api.expose('my-data', { foo: 'bar' });

// In plugin B
const data = api.useExposed('my-data');
```

### api.context

Access build context:

```typescript
const rootPath = api.context.rootPath;
const distPath = api.context.distPath;
```

## Shared State Between Plugins

Built-in plugins share state via these exposed keys:

| Key | Type | Producer |
| :-- | :--- | :------- |
| `files-array` | `Set<string>` | FilesArrayPlugin |
| `entrypoints` | `Map<string, string>` | AutoEntryPlugin |
| `exportToOutputMap` | `Map<string, string>` | AutoEntryPlugin |

**Key descriptions:**

- `files-array` - Files to include in package.json files field
- `entrypoints` - Map of entry names to source file paths
- `exportToOutputMap` - Map of export paths to output file paths

### Accessing Shared State

```typescript
api.processAssets({ stage: 'additional' }, async () => {
  const filesArray = api.useExposed('files-array') as Set<string>;

  // Add a custom file
  filesArray.add('my-custom-file.txt');
});
```

### Creating Custom Shared State

```typescript
// Expose in your plugin
api.modifyRsbuildConfig(() => {
  api.expose('my-plugin-state', new Map());
});

// Use in another plugin or callback
const state = api.useExposed('my-plugin-state');
```

## Further Reading

- [Rsbuild Plugin Development](https://rsbuild.dev/plugins/dev/core)
- [Rspack Plugin API](https://rspack.dev/api/plugin-api)
- [Architecture Overview](../architecture/overview.md)
