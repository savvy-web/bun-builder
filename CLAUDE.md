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
│       └── package-json.ts
├── bun.config.ts                # Self-builds using BunLibraryBuilder
├── package.json
└── tsconfig.json
```

### Key Components

#### BunLibraryBuilder

The main API for building Node.js libraries. Uses Bun.build() for bundling.

**Location**: `src/builders/bun-library-builder.ts`

**Defaults**: `apiModel: true`, `bundle: true` (see `DEFAULT_OPTIONS`).

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

1. **Configuration Phase**: Merge `DEFAULT_OPTIONS` with user options, detect entries from package.json
2. **Pre-Build Phase**: TSDoc linting via ESLint (files discovered by `ImportGraph`)
3. **Bundle Phase**: `Bun.build()` with ESM output (bundled) or individual file compilation (bundleless)
4. **Declaration Phase**: tsgo generates `.d.ts`; API Extractor rolls up (bundled) or raw `.d.ts` emitted (bundleless)
5. **TSDoc/Forgotten Export Reporting**: Warnings collected with source location info and reported per `tsdoc.warnings` / `forgottenExports`
6. **Package.json Phase**: Transform exports, resolve catalogs, generate files array
7. **Copy Phase**: Copy README, LICENSE, public/*

#### Bundleless Mode (`bundle: false`)

When `bundle: false`, the build preserves source directory structure:

- `ImportGraph.traceFromEntries()` discovers all reachable source files from entry points
- Each file is compiled individually via `Bun.build()` with `packages: "external"`
- Raw tsgo `.d.ts` files are emitted directly (no DTS rollup)
- API Extractor still runs for `.api.json` generation if `apiModel` is enabled
- `src/` prefix is stripped: `src/utils/helper.ts` becomes `utils/helper.js`

#### TSDoc Warnings and Forgotten Exports

API Extractor TSDoc warnings are collected with source file location info and
reported after all entries are processed. Controlled via `apiModel.tsdoc.warnings`:
`"fail"` (default in CI), `"log"` (default locally), `"none"`.

Forgotten export warnings also include source location. Controlled via
`apiModel.forgottenExports`: `"error"` (CI), `"include"` (local), `"ignore"`.

#### API Extractor Configuration

- `tsdoc.json` loaded via `TSDocConfigFile.loadForFolder()` for custom tag definitions
- `enumMemberOrder: "preserve"` preserves source-order enum members in API model

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

### Build Output

Output depends on the `bundle` option:

**Bundled mode** (`bundle: true`, default):

- Single-file outputs per export entry point
- TypeScript declarations rolled up via API Extractor
- Optimized for npm publishing and fast runtime loading

**Bundleless mode** (`bundle: false`):

- Source directory structure preserved in output
- Raw `.d.ts` files emitted per source file (no DTS rollup)
- API model still generated if `apiModel` is enabled

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
- [Bun Workspaces](https://bun.sh/docs/install/workspaces)
