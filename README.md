# @savvy-web/bun-builder

[![npm version](https://img.shields.io/npm/v/@savvy-web/bun-builder.svg)](https://www.npmjs.com/package/@savvy-web/bun-builder)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Bun](https://img.shields.io/badge/Bun-%3E%3D1.3.6-f9f1e1?logo=bun)](https://bun.sh)

Build TypeScript libraries in milliseconds with Bun's native bundler. Automatic
entry detection from package.json, rolled-up `.d.ts` declarations, and
`catalog:`/`workspace:` resolution for monorepo publishing -- zero configuration
required.

## Features

- **Sub-Second Builds** -- Bun's native bundler for fast iteration cycles
- **Zero Configuration** -- Auto-detects entry points from package.json exports
- **Rolled-Up Declarations** -- Bundled `.d.ts` files via tsgo + API Extractor
- **Catalog Resolution** -- Resolves Bun `catalog:` and `workspace:` protocols for npm publishing
- **Multi-Target Output** -- Single config produces dev (source maps) and npm (optimized) builds

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

Run the build:

```bash
bun run bun.config.ts                  # Build all targets
bun run bun.config.ts --env-mode dev   # Dev build only
bun run bun.config.ts --env-mode npm   # npm build only
```

## TypeScript Configuration

The package includes a base tsconfig optimized for ESM library builds:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "@savvy-web/bun-builder/tsconfig/ecma/lib.json"
}
```

## Documentation

For configuration options, API reference, and advanced usage:

- [Configuration Reference](./docs/configuration.md) -- Complete options documentation
- [Package.json Transformation](./docs/package-json-transformation.md) -- Export and dependency transforms
- [Declaration Bundling](./docs/declaration-bundling.md) -- TypeScript declaration generation
- [Advanced Usage](./docs/advanced-usage.md) -- Programmatic API and custom pipelines

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

## License

MIT
