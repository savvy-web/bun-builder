# @savvy-web/bun-builder - AI Agent Documentation

This document provides guidance for AI agents working on the
`@savvy-web/bun-builder` package.

## Package Overview

Bun-based build system for modern ESM Node.js libraries. Provides `BunLibraryBuilder`
API for TypeScript packages.

- Bundled or bundleless ESM builds via Bun.build()
- Rolled-up `.d.ts` (bundled) or raw `.d.ts` (bundleless) via tsgo + API Extractor
- Multiple build modes (dev and npm) with different optimizations
- Automatic package.json transformation and Bun catalog resolution
- TSDoc validation with source-location-aware warnings
- Self-building (uses BunLibraryBuilder for its own build)

## Design Documentation

Load design docs for detailed reference on specific topics:

- Architecture overview -> `@./.claude/design/bun-builder/architecture.md`
- Build lifecycle (12 phases) -> `@./.claude/design/bun-builder/build-lifecycle.md`
- Configuration reference -> `@./.claude/design/bun-builder/configuration-reference.md`
- API model options -> `@./.claude/design/bun-builder/api-model-options.md`
- Testing strategy -> `@./.claude/design/bun-builder/testing-strategy.md`

**When to load:**

- **Architecture**: Understanding system design, component responsibilities, data flow
- **Build lifecycle**: Debugging build phases, modifying pipeline, tool integrations
- **Configuration**: Adding/modifying builder options, publish targets
- **API model**: Working on TSDoc, API Extractor, declaration bundling, forgotten exports
- **Testing**: Writing tests, debugging coverage, E2E infrastructure

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
│   ├── macros/                  # Bun compile-time macros
│   │   └── version.ts
│   ├── plugins/
│   │   └── utils/               # Plugin utilities
│   │       ├── catalog-resolver.ts
│   │       ├── entry-extractor.ts
│   │       ├── file-utils.ts
│   │       ├── import-graph.ts
│   │       ├── logger.ts
│   │       ├── package-json-transformer.ts
│   │       ├── tsconfig-resolver.ts
│   │       └── tsdoc-config-builder.ts
│   ├── tsconfig/                # TypeScript config templates
│   ├── public/                  # Static files (tsconfig JSONs)
│   └── types/                   # TypeScript type definitions
│       ├── builder-types.ts
│       ├── global.d.ts
│       ├── package-json.ts
│       └── tsconfig-json.d.ts
├── bun.config.ts                # Self-builds using BunLibraryBuilder
├── package.json
└── tsconfig.json
```

### Key Components

#### BunLibraryBuilder

The main API for building Node.js libraries. Uses Bun.build() for bundling.

**Location**: `src/builders/bun-library-builder.ts`

**Defaults**: `apiModel: true`, `bundle: true`, `splitting: auto` (see `DEFAULT_OPTIONS`).
`splitting` defaults to `true` for multi-entry builds, `false` for single-entry.

**Basic Usage**:

```typescript
import { BunLibraryBuilder } from '@savvy-web/bun-builder';

export default BunLibraryBuilder.create({
  externals: ['lodash'],
  dtsBundledPackages: ['type-fest'],
});
```

### Build Modes

Two build modes with different optimizations:

| Mode | Source Maps | Minify | API Model | Output |
| --- | --- | --- | --- | --- |
| `dev` | linked | false | false | `dist/dev/` |
| `npm` | none | false | true | `dist/npm/` |

Modes selected via `--env-mode`:

```bash
bun run bun.config.ts --env-mode dev
bun run bun.config.ts --env-mode npm
```

## Bun Catalog Protocol

Bun catalogs differ from pnpm. Defined in root `package.json` under
`workspaces.catalog` (default) and `workspaces.catalogs.<name>` (named).

Usage: `"catalog:"` for default catalog, `"catalog:<name>"` for named catalogs.

See [Bun Workspaces](https://bun.sh/docs/install/workspaces) for full reference.

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

# Build all modes
bun run build

# Lint
bun run lint:fix

# Type check
bun run typecheck
```

## External Documentation

- [Bun Documentation](https://bun.sh/docs)
- [Bun.build() API](https://bun.sh/docs/bundler)
- [API Extractor](https://api-extractor.com/)
