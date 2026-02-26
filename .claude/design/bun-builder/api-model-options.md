---
status: current
module: bun-builder
category: reference
created: 2026-02-26
updated: 2026-02-26
last-synced: 2026-02-26
completeness: 95
related:
  - bun-builder/architecture.md
  - bun-builder/build-lifecycle.md
  - bun-builder/configuration-reference.md
dependencies: []
---

# ApiModelOptions Configuration Reference

Quick reference for configuring API model generation in BunLibraryBuilder.

## Table of Contents

1. [Overview](#overview)
2. [Configuration Interface](#configuration-interface)
3. [Option Reference](#option-reference)
4. [Usage Examples](#usage-examples)
5. [Behavior Notes](#behavior-notes)
6. [Related Documentation](#related-documentation)

---

## Overview

The `ApiModelOptions` interface configures API model generation for TypeScript
packages using Microsoft's API Extractor. When enabled, it generates:

- `<package>.api.json` - Machine-readable API documentation for tooling
- `tsdoc-metadata.json` - TSDoc tag metadata for downstream consumers
- `tsconfig.json` - Resolved tsconfig for virtual TypeScript environments
- `tsdoc.json` - Persisted TSDoc config for IDE/ESLint integration

**Source:** `src/hooks/build-lifecycle.ts` (ApiModelConfigResolver),
`src/plugins/utils/tsdoc-config-builder.ts` (TsDocConfigBuilder)

**When to use this reference:**

- Configuring API model generation for a package
- Setting up TSDoc custom tags
- Troubleshooting API Extractor output
- Understanding default behaviors and CI-aware defaults

---

## Configuration Interface

```typescript
interface ApiModelOptions {
  enabled?: boolean;
  filename?: string;
  localPaths?: string[];
  tsdoc?: TsDocOptions;
  tsdocMetadata?: TsDocMetadataOptions | boolean;
  forgottenExports?: "include" | "error" | "ignore";
}

interface TsDocOptions {
  groups?: TsDocTagGroup[];
  tagDefinitions?: TsDocTagDefinition[];
  supportForTags?: Record<string, boolean>;
  persistConfig?: boolean | string;
  warnings?: "log" | "fail" | "none";
  lint?: TsDocLintOptions | boolean;
}

interface TsDocLintOptions {
  enabled?: boolean;
  include?: string[];
  onError?: "warn" | "error" | "throw";
}

interface TsDocMetadataOptions {
  enabled?: boolean;
  filename?: string;
}

type TsDocTagGroup = "core" | "extended" | "discretionary";

interface TsDocTagDefinition {
  tagName: string;
  syntaxKind: "block" | "inline" | "modifier";
  allowMultiple?: boolean;
}
```

**Note:** API model generation is **enabled by default** (`apiModel: true` in
`BunLibraryBuilder.DEFAULT_OPTIONS`). TSDoc linting is controlled via
`apiModel.tsdoc.lint` and is also enabled by default when `apiModel` is enabled.

---

## Option Reference

### ApiModelOptions

**Note:** API model generation is **enabled by default**. The `apiModel` option
defaults to `true` in `BunLibraryBuilder.DEFAULT_OPTIONS`. To disable API model
generation, explicitly set `apiModel: false`.

```typescript
// API model enabled by default (implicit)
BunLibraryBuilder.create({})

// API model enabled with custom options
BunLibraryBuilder.create({
  apiModel: {
    filename: "my-api.json",
  },
})

// Explicitly disable API model
BunLibraryBuilder.create({
  apiModel: false,
})
```

#### `enabled`

| Property | Value |
| --- | --- |
| Type | `boolean` |
| Default | `true` (when `apiModel` is `undefined` or `true`) |
| Required | No |

When `apiModel` is `undefined` (not specified), `ApiModelConfigResolver.resolve()`
returns `enabled: true`. This means npm mode builds generate API models by
default. Set `apiModel: false` to disable.

#### `filename`

| Property | Value |
| --- | --- |
| Type | `string` |
| Default | `<unscopedPackageName>.api.json` |
| Required | No |

Custom filename for the generated API model file. The default follows API
Extractor conventions using the unscoped package name.

```typescript
// Package "@savvy-web/bun-builder" generates "bun-builder.api.json"
apiModel: { enabled: true }

// Custom filename
apiModel: { enabled: true, filename: "api.json" }
```

#### `localPaths`

| Property | Value |
| --- | --- |
| Type | `string[]` |
| Default | `undefined` |
| Required | No |

Local directory paths to copy API model and related files after build completes.
Used for local development with documentation systems.

**Files copied:**

- API model (`<package>.api.json`)
- TSDoc metadata (`tsdoc-metadata.json`) if enabled
- Resolved `tsconfig.json`
- TSDoc config (`tsdoc.json`)
- Transformed `package.json`

**Requirements:**

- Each path must be a directory
- Parent directory must exist (final directory is created if missing)
- Paths are resolved relative to package root

**Behavior:**

- Only runs for `npm` mode
- Skipped in CI environments (detected via `BuildLogger.isCI()` which checks
  both `"true"` and `"1"` for `CI` and `GITHUB_ACTIONS` env vars)
- Validates parent directories exist before build starts (fail-fast)
- Creates destination directories if they don't exist

```typescript
apiModel: {
  enabled: true,
  localPaths: [
    '../website/docs/api/my-package',
    './docs/api',
  ],
}
```

#### `tsdoc`

| Property | Value |
| --- | --- |
| Type | `TsDocOptions` |
| Default | All standard tag groups enabled |
| Required | No |

TSDoc configuration for custom tag definitions and lint. See
[TsDocOptions](#tsdocoptions) section for detailed configuration.

#### `tsdocMetadata`

| Property | Value |
| --- | --- |
| Type | `TsDocMetadataOptions \| boolean` |
| Default | `true` (enabled when apiModel is enabled) |
| Required | No |

Options for `tsdoc-metadata.json` generation. Generated only for the main entry
point (`entryName === "index"` or when there is a single export entry) to
prevent duplicate metadata files in multi-entry packages.

```typescript
// Enable with defaults
apiModel: { enabled: true, tsdocMetadata: true }

// Custom filename
apiModel: {
  enabled: true,
  tsdocMetadata: { enabled: true, filename: "tsdoc-meta.json" }
}

// Disable
apiModel: { enabled: true, tsdocMetadata: false }
```

#### `forgottenExports`

| Property | Value |
| --- | --- |
| Type | `"include" \| "error" \| "ignore"` |
| Default | `"error"` in CI, `"include"` locally |
| Required | No |

Controls handling of API Extractor's "forgotten export" (`ae-forgotten-export`)
messages. A forgotten export occurs when a public API references a declaration
that isn't exported from the entry point.

| Value | Behavior |
| --- | --- |
| `"include"` | Log a warning with source location, include in API model |
| `"error"` | Fail the build with source location details |
| `"ignore"` | Suppress all forgotten export messages silently |

**CI-aware defaults:** In CI environments (`BuildLogger.isCI()` returns `true`),
defaults to `"error"` to fail the build on forgotten exports. Locally defaults
to `"include"` to log warnings without blocking development.

**Source location info:** Forgotten export warnings include `sourceFilePath`,
`sourceFileLine`, and `sourceFileColumn` for precise debugging.

```typescript
// Fail build on forgotten exports
apiModel: { enabled: true, forgottenExports: "error" }

// Suppress forgotten export warnings
apiModel: { enabled: true, forgottenExports: "ignore" }

// Default: CI-aware ("error" in CI, "include" locally)
apiModel: { enabled: true }
```

### TsDocOptions

TSDoc configuration is shared between API model generation and lint validation.
Configure once at `apiModel.tsdoc`, and lint picks up the same tag definitions.

#### `groups`

| Property | Value |
| --- | --- |
| Type | `("core" \| "extended" \| "discretionary")[]` |
| Default | `["core", "extended", "discretionary"]` |
| Required | No |

TSDoc tag groups to enable. Standard tags are imported from `@microsoft/tsdoc`.

**Groups:**

- **core:** `@param`, `@returns`, `@remarks`, `@deprecated`, `@typeParam`,
  `@link`, `@label`, `@packageDocumentation`, `@privateRemarks`
- **extended:** `@example`, `@defaultValue`, `@throws`, `@see`, `@inheritDoc`,
  `@virtual`, `@override`, `@sealed`, `@readonly`, `@eventProperty`,
  `@decorator`
- **discretionary:** `@alpha`, `@beta`, `@experimental`, `@public`, `@internal`

```typescript
// All groups (default)
tsdoc: {}

// Core tags only
tsdoc: { groups: ["core"] }
```

#### `tagDefinitions`

| Property | Value |
| --- | --- |
| Type | `TsDocTagDefinition[]` |
| Default | `[]` |
| Required | No |

Custom TSDoc tag definitions beyond standard groups. Tags are automatically
added to `supportForTags`.

```typescript
tsdoc: {
  tagDefinitions: [
    { tagName: "@error", syntaxKind: "inline" },
    { tagName: "@category", syntaxKind: "block", allowMultiple: false }
  ]
}
```

#### `supportForTags`

| Property | Value |
| --- | --- |
| Type | `Record<string, boolean>` |
| Default | Auto-derived from groups + tagDefinitions |
| Required | No |

Override support for specific tags. **Only needed to disable tags.**

```typescript
// Disable @beta even though "discretionary" group is enabled
tsdoc: {
  supportForTags: { "@beta": false }
}
```

#### `persistConfig`

| Property | Value |
| --- | --- |
| Type | `boolean \| string` |
| Default | `true` locally, validates in CI |
| Required | No |

Controls whether `tsdoc.json` is persisted to disk. In CI environments, the
existing `tsdoc.json` is validated against expected configuration instead of
being written. If the file is missing or out of date, the build fails with
instructions to regenerate locally.

#### `warnings`

| Property | Value |
| --- | --- |
| Type | `"log" \| "fail" \| "none"` |
| Default | `"fail"` in CI, `"log"` locally |
| Required | No |

How to handle TSDoc validation warnings from API Extractor. Warnings are
collected with full source location info (`sourceFilePath`, `sourceFileLine`,
`sourceFileColumn`) and separated into two categories:

- **First-party warnings** (project source files): Respect the `warnings` option
- **Third-party warnings** (node_modules): Always logged, never fail the build

| Value | Behavior |
| --- | --- |
| `"log"` | Show warnings in console, continue build |
| `"fail"` | Show warnings and fail build if any found |
| `"none"` | Suppress TSDoc warnings entirely |

#### `lint`

| Property | Value |
| --- | --- |
| Type | `TsDocLintOptions \| boolean` |
| Default | `true` (enabled when apiModel is enabled) |
| Required | No |

Controls TSDoc linting before the build. See
[Build Lifecycle - Phase 2](./build-lifecycle.md#phase-2-tsdoc-lint) for
execution details.

**TsDocLintOptions fields:**

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | Enable/disable lint |
| `include` | `string[]` | Auto-discovery | Override file discovery |
| `onError` | `"warn" \| "error" \| "throw"` | `"throw"` in CI, `"error"` locally | Error handling |

---

## Usage Examples

### Basic API Model Generation

```typescript
import { BunLibraryBuilder } from '@savvy-web/bun-builder';

// API model enabled by default (apiModel: true in DEFAULT_OPTIONS)
export default BunLibraryBuilder.create({});
```

### Full Configuration

```typescript
import { BunLibraryBuilder } from '@savvy-web/bun-builder';

export default BunLibraryBuilder.create({
  apiModel: {
    enabled: true,
    filename: "bun-builder.api.json",
    localPaths: ["../docs-site/lib/packages/bun-builder"],
    forgottenExports: "error",
    tsdoc: {
      groups: ["core", "extended", "discretionary"],
      tagDefinitions: [
        { tagName: "@error", syntaxKind: "inline" }
      ],
      supportForTags: { "@beta": false },
      persistConfig: true,
      warnings: "fail",
      lint: {
        enabled: true,
        onError: "throw",
        include: ["src/**/*.ts"],
      },
    },
    tsdocMetadata: {
      enabled: true,
      filename: "tsdoc-metadata.json",
    },
  },
});
```

### Development Workflow with Local Paths

```typescript
import { BunLibraryBuilder } from '@savvy-web/bun-builder';

export default BunLibraryBuilder.create({
  apiModel: {
    enabled: true,
    localPaths: [
      "../website/docs/en/packages/my-package"
    ],
    tsdoc: {
      persistConfig: true,
    },
  },
});
```

---

## Behavior Notes

### Multi-Entry API Model Generation

When a package has multiple entry points, API Extractor runs for each entry and
generates a per-entry `.api.json` file in a temp directory. These are then
merged into a single Package with multiple `EntryPoint` members via
`mergeApiModels()`.

**Single entry:** The per-entry API model is used as-is (no merge step).

**Multiple entries:** Each per-entry model's `EntryPoint` is extracted, canonical
references for sub-entries are rewritten to include the export subpath (e.g.,
`@scope/pkg/utils!` instead of `@scope/pkg!`), and all `EntryPoint` members are
combined into one Package. The main entry (`"."`) is always first.

The `exportPaths` mapping from `EntryExtractor` provides the lossless reverse
mapping from entry names back to original export keys for correct canonical
reference scoping.

### File Distribution

| File | Emitted to dist | Published to npm |
| --- | --- | --- |
| `<package>.api.json` | Yes | No (negated pattern) |
| `tsdoc-metadata.json` | Yes (main entry only) | Yes (TSDoc spec) |
| `tsdoc.json` | Yes (skipCIValidation=true) | No (negated pattern) |
| `tsconfig.json` | Yes (if apiModel) | No (negated pattern) |

### Dist tsdoc.json Behavior

The `tsdoc.json` written to the dist output directory uses
`skipCIValidation = true` when calling `TsDocConfigBuilder.writeConfigFile()`.
This is because the dist `tsdoc.json` is a generated build artifact that should
always be written fresh, unlike the project-root `tsdoc.json` which is committed
to version control and validated in CI to ensure it stays in sync with build
options.

### CI Detection

`BuildLogger.isCI()` checks for CI environment indicators, accepting both
`"true"` and `"1"` values for `CI` and `GITHUB_ACTIONS` environment variables.
This affects:

- `forgottenExports` default (`"error"` in CI, `"include"` locally)
- `tsdoc.warnings` default (`"fail"` in CI, `"log"` locally)
- `tsdoc.lint.onError` default (`"throw"` in CI, `"error"` locally)
- Local path copying (skipped in CI)
- tsdoc.json persistence (validate-only in CI, write locally)

### TSDoc Config Optimization

When all tag groups are enabled (the default), the generated `tsdoc.json` uses
`noStandardTags: false` to let TSDoc automatically load all standard tags,
producing a minimal config file. When a subset of groups is specified,
`noStandardTags: true` is used and only the enabled groups' tags are explicitly
defined.

---

## Related Documentation

**Internal Design Docs:**

- [Architecture](./architecture.md) - Overall system architecture
- [Build Lifecycle](./build-lifecycle.md) - Build phases including declaration
  bundling
- [Configuration Reference](./configuration-reference.md) - Full builder options

**Source Code:**

- `src/hooks/build-lifecycle.ts` - ApiModelConfigResolver, declaration bundling
- `src/plugins/utils/tsdoc-config-builder.ts` - TsDocConfigBuilder

**External Resources:**

- [API Extractor](https://api-extractor.com/) - Microsoft's API documentation
  tool
- [TSDoc](https://tsdoc.org/) - Documentation comment standard
- [tsdoc.json Configuration](https://api-extractor.com/pages/configs/tsdoc_json/) -
  TSDoc config file reference

---

**Document Status:** Current - Comprehensive reference for ApiModelOptions
including CI-aware defaults for forgottenExports and warnings, isCI() accepting
"true" and "1", skipCIValidation for dist tsdoc.json, multi-entry merging, and
source location info.
