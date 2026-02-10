# Configuration Reference

Complete reference for all `BunLibraryBuilderOptions` configuration properties.

## Table of Contents

- [Entry Point Configuration](#entry-point-configuration)
- [Output Configuration](#output-configuration)
- [Bundling Configuration](#bundling-configuration)
- [TypeScript Configuration](#typescript-configuration)
- [Transformation Hooks](#transformation-hooks)
- [Documentation and API Model](#documentation-and-api-model)
- [Virtual Entries](#virtual-entries)
- [Build Target Differences](#build-target-differences)

---

## Entry Point Configuration

### `entry`

Override automatically detected entry points.

| Property | Type | Default |
| --- | --- | --- |
| `entry` | `Record<string, string>` | auto-detected from package.json |

By default, entry points are extracted from your `package.json` `exports` and
`bin` fields. Use this option to override or supplement the detected entries.

```typescript
import { BunLibraryBuilder } from '@savvy-web/bun-builder';

export default BunLibraryBuilder.create({
  entry: {
    index: './src/index.ts',
    cli: './src/bin/cli.ts',
  },
});
```

### `exportsAsIndexes`

Generate index.js files in nested directories matching export paths.

| Property | Type | Default |
| --- | --- | --- |
| `exportsAsIndexes` | `boolean` | `false` |

```typescript
// When false (default):
// exports["./foo/bar"] -> dist/foo-bar.js

// When true:
// exports["./foo/bar"] -> dist/foo/bar/index.js

export default BunLibraryBuilder.create({
  exportsAsIndexes: true,
});
```

---

## Output Configuration

### `targets`

Build targets to include in the build.

| Property | Type | Default |
| --- | --- | --- |
| `targets` | `('dev' \| 'npm')[]` | `['dev', 'npm']` |

Can be overridden via CLI with `--env-mode dev` or `--env-mode npm`.

```typescript
export default BunLibraryBuilder.create({
  targets: ['npm'], // Only build npm target
});
```

### `format`

Output module format.

| Property | Type | Default |
| --- | --- | --- |
| `format` | `'esm' \| 'cjs'` | `'esm'` |

Controls the module format of the bundled output.

```typescript
export default BunLibraryBuilder.create({
  format: 'cjs', // CommonJS output
});
```

### `copyPatterns`

Additional files or directories to copy to the output.

| Property | Type | Default |
| --- | --- | --- |
| `copyPatterns` | `(string \| CopyPatternConfig)[]` | auto |

The builder automatically copies `README.md`, `LICENSE`, and `./src/public/` or
`./public/` directories if they exist.

```typescript
export default BunLibraryBuilder.create({
  copyPatterns: [
    // Simple string pattern
    './assets',

    // Detailed configuration
    {
      from: './config',
      to: './config',
    },

    // Optional files (no error if missing)
    {
      from: '.npmrc',
      noErrorOnMissing: true,
    },
  ],
});
```

#### CopyPatternConfig

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `from` | `string` | required | Source path or glob pattern |
| `to` | `string` | `'./'` | Destination path relative to output directory |
| `noErrorOnMissing` | `boolean` | `false` | Suppress errors for missing files |

---

## Bundling Configuration

### `externals`

External dependencies that should not be bundled.

| Property | Type | Default |
| --- | --- | --- |
| `externals` | `(string \| RegExp)[]` | `[]` |

Matching dependencies are kept as external imports in the output.

```typescript
export default BunLibraryBuilder.create({
  externals: [
    'lodash',           // Exact match
    /^@aws-sdk\//,      // All @aws-sdk packages
    /^node:/,           // All Node.js built-ins
  ],
});
```

### `plugins`

Additional Bun plugins to use during bundling.

| Property | Type | Default |
| --- | --- | --- |
| `plugins` | `BunPlugin[]` | `[]` |

Plugins are passed directly to `Bun.build()`.

```typescript
import type { BunPlugin } from 'bun';

const myPlugin: BunPlugin = {
  name: 'my-plugin',
  setup(build) {
    // Plugin implementation
  },
};

export default BunLibraryBuilder.create({
  plugins: [myPlugin],
});
```

### `define`

Build-time constant definitions.

| Property | Type | Default |
| --- | --- | --- |
| `define` | `Record<string, string>` | `{}` |

These constants are replaced at build time. The builder automatically defines
`process.env.__PACKAGE_VERSION__` with the package version.

```typescript
export default BunLibraryBuilder.create({
  define: {
    'process.env.BUILD_TIME': JSON.stringify(new Date().toISOString()),
    '__DEV__': 'false',
  },
});
```

### `bunTarget`

Target runtime for Bun.build().

| Property | Type | Default |
| --- | --- | --- |
| `bunTarget` | `'bun' \| 'node' \| 'browser'` | `'bun'` |

Controls which runtime APIs are available and how imports are resolved:

- `'bun'` -- Target Bun runtime (default, best for Bun-first packages)
- `'node'` -- Target pure Node.js environments
- `'browser'` -- Target browser environments

```typescript
export default BunLibraryBuilder.create({
  bunTarget: 'node', // Use when targeting pure Node.js environments
});
```

---

## TypeScript Configuration

### `tsconfigPath`

Path to the TypeScript configuration file for the build.

| Property | Type | Default |
| --- | --- | --- |
| `tsconfigPath` | `string` | `'./tsconfig.json'` |

Used by both tsgo for declaration generation and API Extractor for declaration
bundling.

```typescript
export default BunLibraryBuilder.create({
  tsconfigPath: './tsconfig.build.json',
});
```

### `dtsBundledPackages`

Packages whose type declarations should be bundled into the output `.d.ts` files.

| Property | Type | Default |
| --- | --- | --- |
| `dtsBundledPackages` | `string[]` | `[]` |

By default, type imports from dependencies are preserved as external references.
Use this to inline type declarations from specific packages.

```typescript
export default BunLibraryBuilder.create({
  dtsBundledPackages: ['type-fest', 'ts-essentials'],
});
```

---

## Transformation Hooks

### `transform`

Transform function to modify package.json before it is saved.

| Property | Type | Default |
| --- | --- | --- |
| `transform` | `TransformPackageJsonFn` | - |

Called after all standard transformations. Allows target-specific modifications.

```typescript
import type { TransformPackageJsonFn, PackageJson } from '@savvy-web/bun-builder';

const transform: TransformPackageJsonFn = ({ target, pkg }): PackageJson => {
  if (target === 'npm') {
    // Remove dev-only fields for npm publishing
    delete pkg.devDependencies;
    delete pkg.scripts;
  }
  return pkg;
};

export default BunLibraryBuilder.create({ transform });
```

#### TransformPackageJsonFn Signature

```typescript
type TransformPackageJsonFn = (context: {
  target: 'dev' | 'npm';
  pkg: PackageJson;
}) => PackageJson;
```

### `transformFiles`

Callback for post-build file manipulation.

| Property | Type | Default |
| --- | --- | --- |
| `transformFiles` | `TransformFilesCallback` | - |

Invoked after bundling and declaration generation but before the final
package.json is written.

```typescript
import type { TransformFilesCallback } from '@savvy-web/bun-builder';

const transformFiles: TransformFilesCallback = async (context) => {
  // Add a generated file
  const metadata = JSON.stringify({
    buildDate: new Date().toISOString(),
    target: context.target,
  });
  context.outputs.set('build-metadata.json', metadata);
  context.filesArray.add('build-metadata.json');
};

export default BunLibraryBuilder.create({ transformFiles });
```

#### TransformFilesContext

| Property | Type | Description |
| --- | --- | --- |
| `outputs` | `Map<string, Uint8Array\|string>` | Map of output filenames to content |
| `filesArray` | `Set<string>` | Files included in package.json `files` field |
| `target` | `'dev' \| 'npm'` | Current build target |

---

## Documentation and API Model

### `apiModel`

Options for API model generation, TSDoc configuration, and TSDoc lint validation.

| Property | Type | Default |
| --- | --- | --- |
| `apiModel` | `boolean \| ApiModelOptions` | `true` (enabled by default) |

When `apiModel` is `undefined` (not specified), API model generation is enabled
by default for npm builds. Set `apiModel: false` to explicitly disable it.

API models are JSON files containing parsed API documentation for documentation
generators. Only generated for the `npm` target.

```typescript
// Uses defaults (API model enabled)
export default BunLibraryBuilder.create({});

// Disable API model
export default BunLibraryBuilder.create({
  apiModel: false,
});

// Custom configuration
export default BunLibraryBuilder.create({
  apiModel: {
    enabled: true,
    filename: 'my-package.api.json',
    localPaths: ['./docs/api'],
    forgottenExports: 'include',
    tsdoc: {
      groups: ['core', 'extended', 'discretionary'],
      lint: {
        enabled: true,
        onError: 'error',
      },
    },
  },
});
```

#### ApiModelOptions

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | Enable API model generation |
| `filename` | `string` | `'<pkg>.api.json'` | Output filename |
| `localPaths` | `string[]` | - | Additional paths to copy API model |
| `tsdoc` | `TsDocOptions` | - | TSDoc configuration (shared with lint) |
| `tsdocMetadata` | `TsDocMetadataOptions \| boolean` | - | tsdoc-metadata.json options |
| `forgottenExports` | `'include' \| 'error' \| 'ignore'` | `'error'` in CI, `'include'` locally | How to handle forgotten export warnings |

#### TsDocOptions (with nested lint)

TSDoc configuration is shared between API model generation and lint validation.
Configure once at `apiModel.tsdoc`, and lint picks up the same tag definitions.

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `groups` | `TsDocTagGroup[]` | `['core', 'extended', 'discretionary']` | Tag groups to enable |
| `tagDefinitions` | `TsDocTagDefinition[]` | - | Custom tag definitions |
| `supportForTags` | `Record<string, boolean>` | - | Override tag support |
| `persistConfig` | `boolean \| string` | `true` locally, `false` in CI | Persist tsdoc.json to disk |
| `warnings` | `'log' \| 'fail' \| 'none'` | `'fail'` in CI, `'log'` locally | TSDoc warning behavior |
| `lint` | `TsDocLintOptions \| boolean` | - | TSDoc lint configuration |

#### TsDocLintOptions

TSDoc lint validation runs before bundling to catch documentation issues early.

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` when apiModel enabled | Enable TSDoc linting |
| `onError` | `'warn' \| 'error' \| 'throw'` | `'throw'` in CI, `'error'` locally | Error handling behavior |
| `include` | `string[]` | auto from entries | Files to lint |

```typescript
// Enable lint with defaults
export default BunLibraryBuilder.create({
  apiModel: {
    tsdoc: {
      lint: true,
    },
  },
});

// Custom lint configuration
export default BunLibraryBuilder.create({
  apiModel: {
    tsdoc: {
      groups: ['core', 'extended', 'discretionary'],
      tagDefinitions: [{ tagName: '@slot', syntaxKind: 'block' }],
      lint: {
        enabled: true,
        onError: 'warn',
        include: ['src/index.ts', 'src/api/*.ts'],
      },
    },
  },
});
```

---

## Virtual Entries

### `virtualEntries`

Bundle files that are NOT part of the package's public exports.

| Property | Type | Default |
| --- | --- | --- |
| `virtualEntries` | `Record<string, VirtualEntryConfig>` | - |

Virtual entries are bundled but skip declaration generation and are not added to
the exports field of package.json. They ARE included in the files array for
publishing.

Common use cases include pnpmfile.cjs, CLI shims, or configuration files that
need bundling.

```typescript
export default BunLibraryBuilder.create({
  virtualEntries: {
    'pnpmfile.cjs': { source: './src/pnpmfile.ts', format: 'cjs' },
    'setup.js': { source: './src/setup.ts' },
  },
});
```

#### VirtualEntryConfig

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `source` | `string` | required | Path to the source file (relative to cwd) |
| `format` | `'esm' \| 'cjs'` | Inherits from builder `format` option | Output format |

---

## Build Target Differences

The builder produces different outputs for each target:

| Option | `dev` Target | `npm` Target |
| --- | --- | --- |
| Source maps | `'linked'` | `'none'` |
| Minification | `false` | `false` |
| API model | `false` | Per `apiModel` option (default: enabled) |
| Catalog resolution | No | Yes |
| `private` field | `true` | Based on `publishConfig` |
| Local path copying | No | Yes (non-CI only) |

### Dev Target

Development builds include:

- Linked source maps for debugging
- `private: true` to prevent accidental publishing
- No catalog reference resolution

### npm Target

Production builds include:

- No source maps (smaller package size)
- Resolved `catalog:` and `workspace:` references
- API model generation (enabled by default)
- `private` based on `publishConfig.access`
- Build artifacts copied to `localPaths` (if configured, non-CI only)

---

## Complete Example

```typescript
import type { BunLibraryBuilderOptions, PackageJson } from '@savvy-web/bun-builder';
import { BunLibraryBuilder } from '@savvy-web/bun-builder';

const options: BunLibraryBuilderOptions = {
  // Entry points (auto-detected by default)
  // entry: { index: './src/index.ts' },

  // Build targets
  targets: ['dev', 'npm'],

  // Output format
  format: 'esm',
  bunTarget: 'bun',

  // Bundling
  externals: ['lodash', /^@aws-sdk\//],
  dtsBundledPackages: ['type-fest'],
  define: {
    '__VERSION__': JSON.stringify('1.0.0'),
  },

  // TypeScript
  tsconfigPath: './tsconfig.json',

  // Files to copy
  copyPatterns: [
    { from: './assets', to: './assets' },
  ],

  // API model generation with TSDoc lint
  apiModel: {
    enabled: true,
    localPaths: ['./docs/api'],
    forgottenExports: 'include',
    tsdoc: {
      lint: {
        enabled: true,
        onError: 'error',
      },
    },
  },

  // Virtual entries (bundled but not exported)
  virtualEntries: {
    'pnpmfile.cjs': { source: './src/pnpmfile.ts', format: 'cjs' },
  },

  // Custom package.json transformation
  transform({ target, pkg }): PackageJson {
    if (target === 'npm') {
      delete pkg.devDependencies;
    }
    return pkg;
  },
};

export default BunLibraryBuilder.create(options);
```
