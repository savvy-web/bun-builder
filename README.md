# @savvy-web/bun-builder

[![npm version](https://img.shields.io/npm/v/@savvy-web/bun-builder.svg)](https://www.npmjs.com/package/@savvy-web/bun-builder)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

A high-performance build system for modern ESM Node.js libraries using Bun's
native bundler. Build TypeScript packages with automatic entry detection,
declaration bundling, and package.json transformation in milliseconds.

## Features

- **Sub-Second Builds** - Leverages Bun's native bundler for fast iteration
- **Zero Configuration** - Auto-detects entry points from package.json exports
- **Declaration Bundling** - Generates rolled-up `.d.ts` files via tsgo + API Extractor
- **Catalog Resolution** - Resolves Bun's `catalog:` and `workspace:` protocols for npm publishing
- **Multi-Target Output** - Single configuration produces both dev and npm builds
- **API Documentation** - Generates `.api.json` files for documentation tools
- **Self-Building** - This package builds itself using `BunLibraryBuilder`

## Installation

```bash
bun add -D @savvy-web/bun-builder
```

### Peer Dependencies

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

## TypeScript Configuration

The package includes a pre-configured `tsconfig.json` optimized for library builds:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "@savvy-web/bun-builder/tsconfig/ecma/lib.json"
}
```

This configuration includes:

- ESNext target with bundler module resolution
- Strict type checking enabled
- Declaration generation for library distribution
- Support for `.ts`, `.tsx`, `.mts`, `.cts`, and `.json` files

## Usage

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

## Build Targets

Two output targets with different optimizations:

| Target | Source Maps | Output Directory | Description |
| --- | --- | --- | --- |
| `dev` | linked | `dist/dev/` | Development build with debugging support |
| `npm` | none | `dist/npm/` | Optimized for npm publishing |

Select a specific target via CLI:

```bash
bun run bun.config.ts --env-mode dev   # Dev build only
bun run bun.config.ts --env-mode npm   # npm build only
bun run bun.config.ts                  # Both targets
```

## Build Output

The build produces bundled ESM output with rolled-up types:

```text
  bun-builder v0.2.0

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
- [Advanced Usage](./docs/advanced-usage.md) - Programmatic API and custom pipelines

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

MIT
