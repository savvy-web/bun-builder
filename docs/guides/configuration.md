# Configuration Reference

Complete reference for all `NodeLibraryBuilder` configuration options.

## Table of Contents

- [Basic Options](#basic-options)
- [Entry Points](#entry-points)
- [External Dependencies](#external-dependencies)
- [Type Generation](#type-generation)
- [Package.json Transform](#packagejson-transform)
- [File Handling](#file-handling)
- [Build Targets](#build-targets)
- [API Model Generation](#api-model-generation)
- [TSDoc Linting](#tsdoc-linting)
- [ImportGraph Utility](#importgraph-utility)

## Basic Options

### Full Interface

```typescript
interface NodeLibraryBuilderOptions {
  entry?: Record<string, string | string[]>;
  exportsAsIndexes?: boolean;
  copyPatterns?: CopyPattern[];
  plugins?: RsbuildPlugin[];
  define?: Record<string, string>;
  tsconfigPath?: string;
  targets?: BuildTarget[];
  externals?: (string | RegExp)[];
  dtsBundledPackages?: string[];
  transformFiles?: TransformFilesCallback;
  transform?: TransformPackageJsonFn;
  apiModel?: ApiModelOptions | boolean;
  tsdocLint?: TsDocLintPluginOptions | boolean;
}

type BuildTarget = 'dev' | 'npm';
```

### Minimal Configuration

```typescript
import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';

export default NodeLibraryBuilder.create({});
```

With no options, rslib-builder:

- Auto-detects entries from package.json exports
- Uses default tsconfig resolution
- Bundles all dependencies
- Generates both dev and npm targets

## Entry Points

### Auto-Detection (Recommended)

By default, entries are extracted from your package.json exports:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./utils": "./src/utils/index.ts",
    "./config": "./src/config.ts"
  }
}
```

This generates three entry points: `index`, `utils`, and `config`.

### Manual Entry Override

Override automatic detection with explicit entries:

```typescript
NodeLibraryBuilder.create({
  entry: {
    index: './src/index.ts',
    cli: './src/cli.ts',
    utils: ['./src/utils/a.ts', './src/utils/b.ts'],
  },
});
```

### Export Output Structure

Control whether exports create directories or files:

```typescript
NodeLibraryBuilder.create({
  exportsAsIndexes: true,  // ./foo → foo/index.js
});
```

**With `exportsAsIndexes: false` (default):**

```text
dist/
├── index.js
├── foo.js
└── bar.js
```

**With `exportsAsIndexes: true`:**

```text
dist/
├── index.js
├── foo/
│   └── index.js
└── bar/
    └── index.js
```

## External Dependencies

### externals

Specify dependencies that should not be bundled:

```typescript
NodeLibraryBuilder.create({
  externals: [
    '@rslib/core',           // Exact match
    '@rsbuild/core',
    /^@types\//,             // Regex pattern
  ],
});
```

Use externals for:

- Peer dependencies
- Build tools your package uses to build other packages
- Large dependencies that consumers already have

### When to Externalize

| Dependency Type | Externalize? | Reason |
| :-------------- | :----------: | :----- |
| peerDependencies | Yes | Consumer provides them |
| dependencies | No | Bundled for reliability |
| devDependencies | Usually no | Not in final package |
| Build tools | Yes | Special case for meta-packages |

## Type Generation

### dtsBundledPackages

Control which package types are inlined in your declarations:

```typescript
NodeLibraryBuilder.create({
  dtsBundledPackages: [
    'picocolors',      // Exact package name
    '@pnpm/**',        // Minimatch pattern
    '@types/*',        // All @types packages
  ],
});
```

**When to bundle types:**

- Private dependencies whose types aren't available to consumers
- Internal packages in a monorepo
- Packages with complex transitive type dependencies

### tsconfigPath

Specify a custom tsconfig for type generation:

```typescript
NodeLibraryBuilder.create({
  tsconfigPath: './tsconfig.build.json',
});
```

If not specified, rslib-builder uses default TypeScript config resolution.

## Package.json Transform

### transform

Modify the output package.json before it's written:

```typescript
NodeLibraryBuilder.create({
  transform({ pkg, target }) {
    // Remove fields not needed for distribution
    if (target === 'npm') {
      delete pkg.devDependencies;
      delete pkg.scripts;
      delete pkg.private;
    }

    // Add custom fields
    pkg.funding = 'https://github.com/sponsors/myorg';

    return pkg;
  },
});
```

**Context provided:**

| Property | Type | Description |
| :------- | :--- | :---------- |
| `pkg` | `PackageJson` | The package.json being transformed |
| `target` | `'dev' \| 'npm'` | Current build target |

### Automatic Transformations

Even without a custom transform, rslib-builder automatically:

1. Resolves PNPM `catalog:` references to actual versions
2. Resolves `workspace:` references to actual versions
3. Updates export paths from `.ts` to `.js`
4. Adds `types` conditions to exports
5. Sets `private: true` for dev builds
6. Removes `publishConfig` and `scripts`
7. Generates `files` array

## File Handling

### copyPatterns

Copy static files to the dist directory:

```typescript
NodeLibraryBuilder.create({
  copyPatterns: [
    {
      from: './**/*.json',
      context: './src/public',
    },
    {
      from: './templates/**/*',
      to: './templates',
    },
  ],
});
```

**Public directory convention:**

If a `public/` directory exists in your project root, its contents are
automatically copied to the dist root.

### transformFiles

Modify files after the build but before the files array is finalized:

```typescript
NodeLibraryBuilder.create({
  transformFiles({ compilation, filesArray, target }) {
    // Copy a file with a new name
    const indexAsset = compilation.assets['index.js'];
    if (indexAsset) {
      compilation.assets['.pnpmfile.cjs'] = indexAsset;
      filesArray.add('.pnpmfile.cjs');
    }
  },
});
```

**Context provided:**

| Property | Type | Description |
| :------- | :--- | :---------- |
| `compilation` | `{ assets }` | Rspack compilation with assets |
| `filesArray` | `Set<string>` | Files to include in package.json |
| `target` | `BuildTarget` | Current build target |

## Build Targets

### targets

Specify which build targets to enable:

```typescript
NodeLibraryBuilder.create({
  targets: ['npm'],  // Only build for npm
});
```

Available targets:

| Target | Source Maps | Use Case |
| :----- | :---------: | :------- |
| `dev` | Yes | Local development, debugging |
| `npm` | No | npm publishing |

### Selecting Target at Build Time

The target is selected via `--env-mode`:

```bash
rslib build --env-mode dev   # Build dev target
rslib build --env-mode npm   # Build npm target
```

## API Model Generation

### apiModel

Generate an API model file for documentation tooling using API Extractor:

```typescript
// Enable with defaults
NodeLibraryBuilder.create({
  apiModel: true,
});

// Enable with custom options
NodeLibraryBuilder.create({
  apiModel: {
    enabled: true,
    filename: 'my-package.api.json',
    localPaths: ['../docs-site/lib/packages/my-package'],
    tsdoc: {
      tagDefinitions: [
        { tagName: '@error', syntaxKind: 'block' },
      ],
      warnings: 'fail',
    },
    tsdocMetadata: true,
  },
});
```

**API Model Options:**

| Option | Type | Default | Description |
| :----- | :--- | :------ | :---------- |
| `enabled` | `boolean` | `true` | Enable API model generation |
| `filename` | `string` | `<package>.api.json` | Output filename |
| `localPaths` | `string[]` | `[]` | Local paths to copy API model files |
| `tsdoc` | `TsDocOptions` | All groups | TSDoc configuration |
| `tsdocMetadata` | `boolean \| object` | `true` | Generate tsdoc-metadata.json |

### TSDoc Configuration

The `tsdoc` option configures custom TSDoc tags and validation:

```typescript
interface TsDocOptions {
  groups?: ('core' | 'extended' | 'discretionary')[];
  tagDefinitions?: TsDocTagDefinition[];
  supportForTags?: Record<string, boolean>;
  persistConfig?: boolean | string;
  warnings?: 'log' | 'fail' | 'none';
}
```

**Tag Groups:**

| Group | Tags Included |
| :---- | :------------ |
| `core` | `@param`, `@returns`, `@remarks`, `@deprecated`, `@typeParam` |
| `extended` | `@example`, `@defaultValue`, `@throws`, `@see`, `@inheritDoc` |
| `discretionary` | `@alpha`, `@beta`, `@public`, `@internal`, `@experimental` |

**Custom Tag Definitions:**

```typescript
apiModel: {
  tsdoc: {
    tagDefinitions: [
      { tagName: '@error', syntaxKind: 'block' },
      { tagName: '@category', syntaxKind: 'block', allowMultiple: false },
    ],
  },
}
```

**TSDoc Warnings Behavior:**

| Value | Behavior |
| :---- | :------- |
| `'log'` | Show warnings, continue build (local default) |
| `'fail'` | Show warnings and fail build (CI default) |
| `'none'` | Suppress TSDoc warnings |

**Note:** API model is only generated for the `npm` target, not `dev`.

## TSDoc Linting

### tsdocLint

Validate TSDoc comments before build using ESLint:

```typescript
// Enable with defaults (automatic file discovery)
NodeLibraryBuilder.create({
  tsdocLint: true,
});

// Enable with custom options
NodeLibraryBuilder.create({
  tsdocLint: {
    enabled: true,
    onError: 'throw',
    persistConfig: true,
    tsdoc: {
      tagDefinitions: [
        { tagName: '@error', syntaxKind: 'block' },
      ],
    },
  },
});
```

**Required Dependencies:**

```bash
pnpm add -D eslint @typescript-eslint/parser eslint-plugin-tsdoc
```

**TSDoc Lint Options:**

| Option | Type | Default | Description |
| :----- | :--- | :------ | :---------- |
| `enabled` | `boolean` | `true` | Enable TSDoc linting |
| `onError` | `'warn' \| 'error' \| 'throw'` | CI: `'throw'`, Local: `'error'` | Error handling |
| `include` | `string[]` | Auto-discover from exports | Override file discovery |
| `persistConfig` | `boolean \| string` | CI: `false`, Local: `true` | Keep tsdoc.json |
| `tsdoc` | `TsDocOptions` | Shared with apiModel | TSDoc configuration |

### Automatic File Discovery

By default, TsDocLintPlugin uses **import graph analysis** to discover files.
It traces imports from your `package.json` exports to find all TypeScript
files that are part of your public API.

**How it works:**

1. Reads entry points from `package.json` exports field
2. Parses each entry file using TypeScript compiler API
3. Recursively traces all `import` and `export` statements
4. Collects only files reachable from public exports

**What gets linted:**

- All `.ts` and `.tsx` files reachable from exports
- Files referenced through path aliases (via tsconfig paths)

**What gets excluded:**

- Test files (`*.test.ts`, `*.spec.ts`)
- Test directories (`__test__/`, `__tests__/`)
- Declaration files (`.d.ts`)
- External packages (`node_modules`)

This approach ensures you only lint documentation that consumers will see,
avoiding noise from internal implementation details.

### Overriding File Discovery

Use the `include` option when you need to:

- Lint internal files not reachable from exports
- Lint a subset of your public API
- Use specific glob patterns for file selection

```typescript
NodeLibraryBuilder.create({
  tsdocLint: {
    // Override automatic discovery with explicit patterns
    include: ['src/**/*.ts', '!**/*.test.ts'],
  },
});
```

When `include` is specified, automatic discovery is bypassed entirely and
only the specified glob patterns are used.

### Configuration Sharing

When both `tsdocLint` and `apiModel` are enabled, TSDoc configuration is
automatically shared from `apiModel.tsdoc` if `tsdocLint.tsdoc` is not set:

```typescript
NodeLibraryBuilder.create({
  apiModel: {
    enabled: true,
    tsdoc: {
      tagDefinitions: [{ tagName: '@error', syntaxKind: 'block' }],
    },
  },
  tsdocLint: true,  // Automatically uses apiModel.tsdoc
});
```

### Error Handling

| Environment | Default `onError` | Lint Errors | Build Result         |
| :---------- | :---------------- | :---------- | :------------------- |
| Local       | `'error'`         | Yes         | Continue, log errors |
| CI          | `'throw'`         | Yes         | Fail build           |

## ImportGraph Utility

The `ImportGraph` class is exported for advanced use cases where you need to
analyze TypeScript import relationships programmatically.

### Basic Usage

```typescript
import { ImportGraph } from '@savvy-web/rslib-builder';

// Trace from explicit entry points
const result = ImportGraph.fromEntries(
  ['./src/index.ts', './src/cli.ts'],
  { rootDir: process.cwd() }
);

console.log('Files:', result.files);
console.log('Entries:', result.entries);
console.log('Errors:', result.errors);
```

### Trace from Package Exports

```typescript
import { ImportGraph } from '@savvy-web/rslib-builder';

// Discover all files from package.json exports
const result = ImportGraph.fromPackageExports(
  './package.json',
  { rootDir: process.cwd() }
);

console.log('Public API files:', result.files);
```

### Instance Methods for Repeated Analysis

For repeated analysis where you want to reuse the TypeScript program:

```typescript
import { ImportGraph } from '@savvy-web/rslib-builder';

const graph = new ImportGraph({ rootDir: '/path/to/project' });

// Reuses the TypeScript program across calls
const libResult = graph.traceFromEntries(['./src/index.ts']);
const cliResult = graph.traceFromEntries(['./src/cli.ts']);
```

### ImportGraphOptions

| Option | Type | Default | Description |
| :----- | :--- | :------ | :---------- |
| `rootDir` | `string` | Required | Project root directory |
| `tsconfigPath` | `string` | Auto-detect | Custom tsconfig path |
| `excludePatterns` | `string[]` | `[]` | Additional patterns to exclude from results |

### Exclude Patterns

By default, ImportGraph excludes these file patterns:

- `.test.` and `.spec.` files
- `__test__` and `__tests__` directories
- `.d.ts` declaration files

Use `excludePatterns` to exclude additional files:

```typescript
import { ImportGraph } from '@savvy-web/rslib-builder';

const graph = new ImportGraph({
  rootDir: process.cwd(),
  excludePatterns: [
    '.stories.',     // Storybook files
    '/mocks/',       // Mock directories
    '/fixtures/',    // Test fixtures
    '.bench.',       // Benchmark files
  ],
});

const result = graph.traceFromEntries(['./src/index.ts']);
```

Patterns are matched using simple string inclusion against file paths.

### ImportGraphResult

| Property | Type | Description |
| :------- | :--- | :---------- |
| `files` | `string[]` | All reachable TypeScript files (sorted, absolute paths) |
| `entries` | `string[]` | The entry points that were traced |
| `errors` | `ImportGraphError[]` | Structured errors encountered during analysis |

### Structured Error Handling

ImportGraph uses structured errors for programmatic error handling. Each error
includes a `type` field that allows you to handle different failure modes
appropriately:

```typescript
import { ImportGraph } from '@savvy-web/rslib-builder';
import type { ImportGraphError } from '@savvy-web/rslib-builder';

const result = ImportGraph.fromPackageExports('./package.json', {
  rootDir: process.cwd(),
});

// Handle errors based on type
for (const error of result.errors) {
  switch (error.type) {
    case 'tsconfig_not_found':
      console.warn('No tsconfig.json found, using defaults');
      break;
    case 'entry_not_found':
      console.error(`Missing entry file: ${error.path}`);
      break;
    case 'package_json_not_found':
      console.error(`Package not found: ${error.path}`);
      break;
    case 'file_read_error':
      console.warn(`Could not read file: ${error.path}`);
      break;
    default:
      console.error(error.message);
  }
}
```

### ImportGraphError

| Property | Type | Description |
| :------- | :--- | :---------- |
| `type` | `ImportGraphErrorType` | Error type for programmatic handling |
| `message` | `string` | Human-readable error message |
| `path` | `string \| undefined` | Related file path (when applicable) |

### ImportGraphErrorType

| Type | Description |
| :--- | :---------- |
| `tsconfig_not_found` | No tsconfig.json found in project |
| `tsconfig_read_error` | Failed to read tsconfig.json |
| `tsconfig_parse_error` | Failed to parse tsconfig.json |
| `package_json_not_found` | Package.json not found |
| `package_json_parse_error` | Failed to parse package.json |
| `entry_not_found` | Entry file does not exist |
| `file_read_error` | Failed to read a source file |

### Use Cases

- **Custom linting tools**: Find files to lint based on export reachability
- **Dependency analysis**: Understand which files depend on which
- **Code coverage**: Identify public API surface for coverage targets
- **Documentation**: Discover files that need documentation

## Define Constants

### define

Inject compile-time constants:

```typescript
NodeLibraryBuilder.create({
  define: {
    'process.env.DEBUG': JSON.stringify('true'),
    '__VERSION__': JSON.stringify('1.0.0'),
  },
});
```

**Built-in defines:**

- `process.env.__PACKAGE_VERSION__` - Automatically set to package version

## Full Example

```typescript
import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';

export default NodeLibraryBuilder.create({
  // Type generation
  tsconfigPath: './tsconfig.build.json',
  dtsBundledPackages: ['picocolors', '@pnpm/**'],

  // Dependencies
  externals: ['@rslib/core', '@rsbuild/core'],

  // Output structure
  exportsAsIndexes: true,

  // Static files
  copyPatterns: [
    { from: './templates/**/*', context: './src' },
  ],

  // Package.json customization
  transform({ pkg, target }) {
    if (target === 'npm') {
      delete pkg.devDependencies;
      delete pkg.scripts;
    }
    return pkg;
  },

  // API documentation
  apiModel: {
    enabled: true,
    tsdoc: {
      tagDefinitions: [
        { tagName: '@error', syntaxKind: 'block' },
      ],
      warnings: 'fail',
    },
  },

  // TSDoc validation (optional - requires eslint dependencies)
  tsdocLint: {
    onError: 'throw',
    persistConfig: true,
  },

  // Build constants
  define: {
    '__DEV__': JSON.stringify(false),
  },
});
```
