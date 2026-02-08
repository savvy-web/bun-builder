# @savvy-web/bun-builder - AI Agent Documentation

This document provides guidance for AI agents working on the
`@savvy-web/bun-builder` package.

## Package Overview

Bun-based build system for modern ESM Node.js libraries. Provides `BunLibraryBuilder`
API for TypeScript packages.

- Bundled ESM builds with rolled-up types via Bun.build()
- Multiple targets (dev and npm) with different optimizations
- Automatic package.json transformation and Bun catalog resolution
- TypeScript declarations via tsgo + API Extractor
- Self-building (uses BunLibraryBuilder for its own build)

## Design Documentation

For detailed architecture understanding, load the design doc:

--> `@./.claude/design/bun-builder/architecture.md`

**Load when:**

- Understanding the build lifecycle phases
- Modifying entry extraction or catalog resolution
- Debugging build output or package.json transformation
- Extending the builder API with new options

## Architecture

### Directory Structure

```text
bun-builder/
├── src/
│   ├── index.ts                 # Main exports
│   ├── builders/                # High-level builder classes
│   │   └── bun-library-builder.ts
│   ├── hooks/                   # Build lifecycle orchestration
│   │   └── build-lifecycle.ts
│   ├── plugins/
│   │   └── utils/               # Plugin utilities
│   │       ├── catalog-resolver.ts
│   │       ├── entry-extractor.ts
│   │       ├── file-utils.ts
│   │       ├── logger.ts
│   │       └── package-json-transformer.ts
│   ├── tsconfig/                # TypeScript config templates
│   ├── public/                  # Static files (tsconfig JSONs)
│   └── types/                   # TypeScript type definitions
│       ├── builder-types.ts
│       └── package-json.ts
├── bun.config.ts                # Self-builds using BunLibraryBuilder
├── package.json
└── tsconfig.json
```

### Key Components

#### BunLibraryBuilder

The main API for building Node.js libraries. Uses Bun.build() for bundling.

**Location**: `src/builders/bun-library-builder.ts`

**Basic Usage**:

```typescript
import { BunLibraryBuilder } from '@savvy-web/bun-builder';

export default BunLibraryBuilder.create({
  externals: ['lodash'],
  dtsBundledPackages: ['type-fest'],
});
```

#### Build Pipeline

The build lifecycle in `src/hooks/build-lifecycle.ts` orchestrates:

1. **Configuration Phase**: Merge options, detect entries from package.json
2. **Pre-Build Phase**: TSDoc linting via ESLint
3. **Bundle Phase**: Bun.build() with ESM output
4. **Declaration Phase**: tsgo + API Extractor for .d.ts bundling
5. **Package.json Phase**: Transform exports, resolve catalogs, generate files array
6. **Copy Phase**: Copy README, LICENSE, public/*

### Build Targets

Two build targets with different optimizations:

| Target | Source Maps | Minify | API Model | Output |
| --- | --- | --- | --- | --- |
| `dev` | linked | false | false | `dist/dev/` |
| `npm` | none | false | true | `dist/npm/` |

Targets selected via `--env-mode`:

```bash
bun run bun.config.ts --env-mode dev
bun run bun.config.ts --env-mode npm
```

### Build Output

This module produces bundled ESM output with rolled-up types:

- Single-file outputs per export entry point
- TypeScript declarations bundled via API Extractor
- Optimized for npm publishing and fast runtime loading

## Bun Catalog Protocol

Bun uses a different catalog format than pnpm. Catalogs are defined in the root
package.json under the `workspaces` field:

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

Usage in package.json:

```json
{
  "dependencies": {
    "react": "catalog:",          // From default catalog
    "vitest": "catalog:testing"   // From named catalog
  }
}
```

## Testing

Tests use Bun's built-in test runner:

```bash
bun test
bun test --watch
bun test --coverage
```

## Development Commands

```bash
# Build for development
bun run build:dev

# Build for npm
bun run build:npm

# Build all targets
bun run build

# Lint
bun run lint:fix

# Type check
bun run typecheck
```

## External Documentation

- [Bun Documentation](https://bun.sh/docs)
- [Bun.build() API](https://bun.sh/docs/bundler)
- [Bun Workspaces](https://bun.sh/docs/install/workspaces)
