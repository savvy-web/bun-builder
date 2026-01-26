# @savvy-web/bun-builder

A high-performance build system for modern ESM Node.js libraries using Bun's
native bundler. Provides automatic entry detection, TypeScript declaration
bundling, and package.json transformation with minimal configuration.

## Features

- **Fast Builds** - Uses Bun's native bundler for sub-second build times
- **Automatic Entry Detection** - Extracts entry points from package.json exports and bin fields
- **Declaration Bundling** - Generates rolled-up `.d.ts` files via tsgo + API Extractor
- **Catalog Resolution** - Resolves Bun's `catalog:` and `workspace:` protocols for npm publishing
- **Multi-Target Builds** - Single configuration produces both dev and npm outputs
- **Self-Building** - The package builds itself using `BunLibraryBuilder`

## Installation

```bash
bun add -D @savvy-web/bun-builder
```

### Peer Dependencies

The following peer dependencies are required:

```bash
bun add -D @microsoft/api-extractor @typescript/native-preview typescript @types/bun
```

## Quick Start

Create a `bun.config.ts` file in your project root:

```typescript
import { BunLibraryBuilder } from '@savvy-web/bun-builder';

export default BunLibraryBuilder.create({});
```

Add build scripts to your `package.json`:

```json
{
  "scripts": {
    "build": "bun run bun.config.ts",
    "build:dev": "bun run bun.config.ts --env-mode dev",
    "build:npm": "bun run bun.config.ts --env-mode npm"
  }
}
```

Run the build:

```bash
bun run build
```

## Basic Usage

The builder automatically extracts entry points from your `package.json` exports:

```json
{
  "name": "my-library",
  "exports": {
    ".": "./src/index.ts",
    "./utils": "./src/utils.ts"
  }
}
```

```typescript
// bun.config.ts
import { BunLibraryBuilder } from '@savvy-web/bun-builder';

export default BunLibraryBuilder.create({
  // Keep certain packages as external dependencies
  externals: ['lodash', /^@aws-sdk\//],

  // Bundle type definitions from these packages into your .d.ts
  dtsBundledPackages: ['type-fest'],

  // Enable TSDoc validation before build
  tsdocLint: true,

  // Generate API model for documentation tools
  apiModel: true,
});
```

## Configuration Options

| Option              | Type                             | Default              | Description                          |
|---------------------|----------------------------------|----------------------|--------------------------------------|
| `entry`             | `Record<string, string>`         | auto-detected        | Override entry points                |
| `externals`         | `(string \| RegExp)[]`           | `[]`                 | Dependencies to exclude from bundle  |
| `dtsBundledPackages`| `string[]`                       | `[]`                 | Packages to inline in `.d.ts` output |
| `targets`           | `('dev' \| 'npm')[]`             | `['dev', 'npm']`     | Build targets to generate            |
| `tsconfigPath`      | `string`                         | `'./tsconfig.json'`  | Path to TypeScript config            |
| `tsdocLint`         | `boolean \| TsDocLintOptions`    | `false`              | Enable TSDoc validation              |
| `apiModel`          | `boolean \| ApiModelOptions`     | `false`              | Generate API model JSON              |
| `copyPatterns`      | `(string \| CopyPatternConfig)[]`| auto                 | Additional files to copy             |
| `transform`         | `TransformPackageJsonFn`         | -                    | Modify output package.json           |
| `transformFiles`    | `TransformFilesCallback`         | -                    | Post-build file processing           |

## Build Targets

The builder produces two output targets with different optimizations:

| Target | Source Maps | Output Directory | Description                              |
|--------|-------------|------------------|------------------------------------------|
| `dev`  | linked      | `dist/dev/`      | Development build with debugging support |
| `npm`  | none        | `dist/npm/`      | Optimized for npm publishing             |

Select a specific target via CLI:

```bash
bun run bun.config.ts --env-mode dev   # Dev build only
bun run bun.config.ts --env-mode npm   # npm build only
bun run bun.config.ts                  # Both targets
```

## CLI Usage

```bash
# Build all targets
bun run bun.config.ts

# Build specific target
bun run bun.config.ts --env-mode dev
bun run bun.config.ts --env-mode npm
```

The build output shows detected entries, progress, and a file table:

```text
  bun-builder v0.1.0

info    Building targets: dev, npm
info    auto-detected entries { index: "./src/index.ts" }
info    Using tsconfig: tsconfig.json
info    [dev] build started...
info    [dev] Bundled 1 file(s) in 42ms
info    [dev] Generating declaration files...
info    [dev] Generated declarations in 156ms
info    [dev] Emitted 1 bundled declaration file in 89ms
ready   [dev] built in 287ms

  dist/dev (dev)
  File            Size
  index.js        12.4 KB
  index.d.ts       2.1 KB
  package.json     0.5 KB
```

## Requirements

- **Bun** >= 1.3.0
- **Node.js** >= 20.0.0 (for peer dependencies)
- **TypeScript** >= 5.5.0

## Documentation

- [Configuration Reference](./docs/configuration.md) - Complete options documentation
- [Package.json Transformation](./docs/package-json-transformation.md) - How exports and dependencies are transformed
- [Declaration Bundling](./docs/declaration-bundling.md) - TypeScript declaration generation
- [Advanced Usage](./docs/advanced-usage.md) - Programmatic API and custom plugins

## License

MIT
