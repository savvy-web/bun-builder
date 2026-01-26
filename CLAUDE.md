# @savvy-web/rslib-builder - AI Agent Documentation

This document provides guidance for AI agents working on the
`@savvy-web/rslib-builder` package.

## Package Overview

RSlib-based build system for modern ESM Node.js libraries. Provides `NodeLibraryBuilder`
API and plugin system for TypeScript packages.

- Bundled ESM builds with rolled-up types
- Multiple targets (dev and npm) with different optimizations
- Automatic package.json transformation and pnpm catalog resolution
- TypeScript declarations via tsgo + API Extractor
- Self-building (uses NodeLibraryBuilder for its own build)

## Design Documentation

For detailed architecture understanding, load the design doc:

--> `@./.claude/design/rslib-builder/architecture.md`

**Load when:**

- Adding new plugins to the build system
- Modifying plugin execution order or stages
- Debugging cross-plugin data flow issues
- Extending the builder API with new options

## Architecture

### Directory Structure

```text
rslib-builder/
├── src/
│   ├── rslib/                    # RSlib build system
│   │   ├── index.ts             # Main exports
│   │   ├── builders/            # High-level builder classes
│   │   │   ├── node-library-builder.ts
│   │   │   └── node-library-builder.test.ts
│   │   └── plugins/             # RSlib/Rsbuild plugins
│   │       ├── auto-entry-plugin.ts
│   │       ├── auto-entry-plugin.test.ts
│   │       ├── dts-plugin.ts
│   │       ├── dts-plugin.test.ts
│   │       ├── files-array-plugin.ts
│   │       ├── files-array-plugin.test.ts
│   │       ├── package-json-transform-plugin.ts
│   │       ├── package-json-transform-plugin.test.ts
│   │       ├── tsdoc-lint-plugin.ts
│   │       ├── tsdoc-lint-plugin.test.ts
│   │       └── utils/           # Plugin utilities (with co-located tests)
│   ├── tsconfig/                # TypeScript config templates
│   ├── public/                  # Static files (tsconfig JSONs)
│   ├── __test__/                # Shared test utilities
│   │   └── rslib/
│   │       ├── types/           # Test type definitions
│   │       └── utils/           # Test helper functions
│   └── types/                   # TypeScript type definitions
├── rslib.config.ts              # Self-builds using NodeLibraryBuilder
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### Key Components

#### NodeLibraryBuilder

The main API for building Node.js libraries. Provides a fluent interface for
RSlib builds.

**Location**: `src/rslib/builders/node-library-builder.ts`

**Basic Usage**:

```typescript
import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';

export default NodeLibraryBuilder.create({
  externals: ['@rslib/core'],
  dtsBundledPackages: ['picocolors'],
});
```

#### Plugin System

Custom RSlib plugins handle complex build scenarios:

1. **TsDocLintPlugin** - Validates TSDoc comments before build using ESLint
2. **AutoEntryPlugin** - Automatically extracts entry points from package.json exports
3. **PackageJsonTransformPlugin** - Transforms package.json for different targets
4. **DtsPlugin** - Generates TypeScript declarations using tsgo and API Extractor
5. **FilesArrayPlugin** - Generates files array, excludes source maps

### Build Targets

Two build targets with different optimizations:

- **dev**: Unminified, with source maps, for local development
- **npm**: Optimized for npm publishing (Node.js runtime)

Targets selected via `--env-mode`:

```bash
rslib build --env-mode dev
rslib build --env-mode npm
```

### Build Output

This module produces bundled ESM output with rolled-up types:

- Single-file outputs per export entry point
- TypeScript declarations bundled via API Extractor
- Optimized for npm publishing and fast runtime loading

## Testing

Tests are co-located with source files. Use type-safe mocks:

```typescript
import type { MockAssetRegistry } from '../__test__/rslib/types/test-types.js';

const mockAssets: MockAssetRegistry = {
  'index.js': { source: () => 'export {}' }
};
```

**Never use `as any`**. Always create proper mock types.

## Plugin Execution Order

Plugins execute in this order during the build:

**Pre-Build Hooks:**

- TsDocLintPlugin (`onBeforeBuild` - validates TSDoc before compilation)

**Build Hooks:**

1. AutoEntryPlugin (entry detection - `modifyRsbuildConfig`)
2. DtsPlugin (type declarations - `pre-process` stage)
3. PackageJsonTransformPlugin (package.json processing)
4. FilesArrayPlugin (files array - `additional` stage)
5. User plugins (if provided)

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development workflow, commands,
and troubleshooting.

## External Documentation

- [RSlib Documentation](https://rslib.dev/)
- [Rsbuild Plugin API](https://rsbuild.dev/plugins/dev/core)
- [PNPM Catalog Protocol](https://pnpm.io/catalogs)
