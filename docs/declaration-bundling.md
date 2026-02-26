# Declaration Bundling

How `@savvy-web/bun-builder` generates and bundles TypeScript declarations.

## Table of Contents

- [Overview](#overview)
- [Import Graph Filtering](#import-graph-filtering)
- [Declaration Generation with tsgo](#declaration-generation-with-tsgo)
- [Declaration Bundling with API Extractor](#declaration-bundling-with-api-extractor)
- [Bundleless Mode](#bundleless-mode)
- [TSDoc Warnings](#tsdoc-warnings)
- [Forgotten Exports](#forgotten-exports)
- [dtsBundledPackages Option](#dtsbundledpackages-option)
- [API Model Generation](#api-model-generation)
- [Fallback Behavior](#fallback-behavior)
- [Troubleshooting](#troubleshooting)

---

## Overview

The builder uses a two-stage process for TypeScript declarations:

1. **tsgo** - Generates individual `.d.ts` files from TypeScript source
2. **API Extractor** - Bundles declarations into a single rolled-up file

This produces clean, single-file declarations that are easier for consumers to
work with and result in faster IDE performance.

---

## Import Graph Filtering

Declaration file output is filtered using import graph analysis from entry
points. This ensures only relevant `.d.ts` files are included in the final
build output.

### How It Works

1. `ImportGraph.traceFromEntries()` walks the import/export graph starting from
   each package.json entry point
2. Only source files reachable from those entry points are considered for
   declaration output
3. Unreachable files (internal helpers, test utilities) are excluded automatically

### Automatic Test File Exclusion

The following patterns are always excluded from declaration output, even if they
appear in the import graph:

- Files matching `*.test.d.ts` or `*.spec.d.ts`
- Files inside `__test__/` directories
- Files inside `__tests__/` directories

This prevents test-only types from leaking into published packages.

### Applies to Both Modes

Import graph filtering is used in:

- **Bundle mode** -- When API Extractor falls back to copying unbundled
  declarations, only reachable files are copied
- **Bundleless mode** -- Raw `.d.ts` files are filtered so only reachable
  source files produce declaration output

---

## Declaration Generation with tsgo

### What is tsgo?

[tsgo](https://github.com/nicolo-ribaudo/tsgo) is a high-performance TypeScript
compiler written in Go. It's 10-100x faster than the standard `tsc` compiler
for declaration generation.

### How It Works

1. The builder creates a temporary tsconfig based on your project's configuration
2. tsgo is invoked with `--declaration --emitDeclarationOnly` flags
3. Declaration files are written to a temporary directory
4. These files are then processed by API Extractor

### Configuration

tsgo uses your project's `tsconfig.json` (or the path specified in `tsconfigPath`):

```typescript
export default BunLibraryBuilder.create({
  tsconfigPath: './tsconfig.build.json', // Custom tsconfig for declarations
});
```

### Temporary Files

Declaration files are generated in:

```text
.bun-builder/declarations/{target}/
```

This directory is cleaned before each build.

---

## Declaration Bundling with API Extractor

### What is API Extractor?

[API Extractor](https://api-extractor.com/) is a tool from Microsoft that
analyzes TypeScript declarations and produces:

- **Rolled-up declarations** -- Single `.d.ts` file per export entry
- **API reports** -- Documentation of your public API
- **API models** -- JSON files for documentation generators

### Benefits of Bundled Declarations

| Feature | Unbundled | Bundled |
| --- | --- | --- |
| File count | Many `.d.ts` files | One per export entry |
| IDE performance | Slower (more files to parse) | Faster |
| Package size | Larger | Smaller |
| Consumer experience | Scattered types | Clean single entry |

### Bundling Process (Multi-Entry)

API Extractor runs once per export entry point (bin entries are skipped):

1. For each export entry, API Extractor reads the entry point declaration
2. It follows imports to collect all related declarations
3. Internal types are inlined, public types are preserved
4. A per-entry `.d.ts` file is written to the output directory
5. Per-entry API models are merged into a single Package with multiple
   EntryPoint members, with canonical references rewritten for sub-entries

### Output Example

**Before bundling:**

```text
.bun-builder/declarations/npm/
├── index.d.ts
├── utils/
│   ├── helpers.d.ts
│   └── formatters.d.ts
└── types/
    └── config.d.ts
```

**After bundling (multi-entry):**

```text
dist/npm/
├── index.d.ts   (bundled types for "." export)
└── utils.d.ts   (bundled types for "./utils" export)
```

---

## Bundleless Mode

When `bundle: false`, declarations are handled differently from the default
bundled mode.

### How It Works

1. tsgo generates individual `.d.ts` files as normal
2. Import graph analysis determines which files are reachable from entry points
3. Only reachable `.d.ts` files are copied to the output directory (no DTS rollup);
   test files and `__test__`/`__tests__` directories are excluded
4. The `src/` prefix is stripped: `src/utils/helper.d.ts` becomes `utils/helper.d.ts`
5. API Extractor still runs for `.api.json` generation if `apiModel` is enabled,
   but with `dtsRollup: { enabled: false }`

### Output Example

**Bundleless output:**

```text
dist/npm/
├── index.js
├── index.d.ts
├── utils/
│   ├── helpers.js
│   ├── helpers.d.ts
│   ├── formatters.js
│   └── formatters.d.ts
└── types/
    ├── config.js
    └── config.d.ts
```

### When to Use Bundleless Mode

- Packages where consumers import deep paths (e.g., `import { x } from 'pkg/utils/helpers'`)
- Libraries that re-export many modules and want to preserve tree-shaking granularity
- When DTS rollup causes issues with complex type dependencies

### Configuration

```typescript
import { BunLibraryBuilder } from '@savvy-web/bun-builder';

export default BunLibraryBuilder.create({
  bundle: false,
  apiModel: true, // Still generates .api.json for documentation
});
```

---

## TSDoc Warnings

API Extractor collects TSDoc warnings during declaration bundling and reports
them with source file location info for easier debugging.

### How Warnings Are Collected

During API Extractor runs, TSDoc warnings (messages with IDs starting with
`tsdoc-`) are intercepted and collected rather than logged immediately. Each
warning records:

- Warning text
- Entry point name
- Source file path
- Line and column numbers

### First-Party vs. Third-Party

Warnings are separated by origin:

- **First-party** (your source code) -- controlled by `tsdoc.warnings` option
- **Third-party** (node\_modules) -- always logged as warnings, never fail the build

### Warning Behavior

Controlled via `apiModel.tsdoc.warnings`:

| Value | Behavior |
| --- | --- |
| `"fail"` (CI default) | Throw error and abort build |
| `"log"` (local default) | Log warnings and continue |
| `"none"` | Suppress entirely |

### TSDocConfigFile Loading

API Extractor loads `tsdoc.json` via `TSDocConfigFile.loadForFolder()` from
`@microsoft/tsdoc-config`. This means custom tag definitions in your project's
`tsdoc.json` are automatically respected during declaration bundling, without
needing to duplicate configuration.

---

## Forgotten Exports

API Extractor reports `ae-forgotten-export` when a public API references a
declaration that is not exported. These warnings now include source file
location info.

### Warning Format

Forgotten export warnings include the source file path, line, and column where
the unexported declaration is referenced:

```text
warn    [npm] Forgotten exports detected:
  [index] (src/types/internal.ts:15:0) The symbol "InternalConfig" needs to be exported...
```

### Controlling Behavior

The `apiModel.forgottenExports` option determines how these are handled:

| Value | Behavior |
| --- | --- |
| `"error"` (CI default) | Throw error and abort build |
| `"include"` (local default) | Log with source locations |
| `"ignore"` | Suppress silently |

```typescript
export default BunLibraryBuilder.create({
  apiModel: {
    forgottenExports: 'include', // Log warnings locally
  },
});
```

---

## dtsBundledPackages Option

Control which dependency types are inlined vs. referenced.

### Default Behavior

By default, type imports from dependencies are preserved as external references:

```typescript
// Output index.d.ts
import type { SomeType } from 'external-package';

export declare function myFunction(): SomeType;
```

### Inlining Dependency Types

Use `dtsBundledPackages` to inline types from specific packages:

```typescript
export default BunLibraryBuilder.create({
  dtsBundledPackages: ['type-fest', 'ts-essentials'],
});
```

**Before:**

```typescript
import type { SetRequired } from 'type-fest';

export declare function myFunction(opts: SetRequired<Options, 'name'>): void;
```

**After:**

```typescript
// type-fest types are inlined
type SetRequired<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

export declare function myFunction(opts: SetRequired<Options, 'name'>): void;
```

### When to Use

Use `dtsBundledPackages` when:

- Your public API uses utility types from a package
- You want to reduce the dependency footprint for type-only packages
- The dependency provides types that consumers shouldn't need to install

---

## API Model Generation

Generate API model JSON files for documentation tools.

### Enabling API Models

```typescript
export default BunLibraryBuilder.create({
  apiModel: true,
  // Or with options:
  apiModel: {
    enabled: true,
    filename: 'my-package.api.json',
    localPaths: ['./docs/api'],
  },
});
```

### What's in an API Model?

The API model contains:

- All public API signatures
- TSDoc documentation comments
- Type information
- Source file locations
- Enum members in source order (`enumMemberOrder: "preserve"`)

### Using API Models

API models are consumed by documentation generators:

- [API Documenter](https://api-extractor.com/pages/setup/generating_docs/) - Markdown docs
- Custom documentation tools
- IDE integrations

### Output Location

API model files are:

- Written to the output directory (`dist/npm/<pkg>.api.json`)
- Excluded from npm publish via negation in `files` array
- Optionally copied to additional `localPaths`

---

## Fallback Behavior

When API Extractor fails or is unavailable, the builder falls back to copying
unbundled declarations.

### When Fallback Occurs

- API Extractor package not installed
- Declaration bundling fails (type errors, etc.)
- Main entry point declaration not found

### Fallback Output

Instead of a single bundled file, individual `.d.ts` files are copied. Only
files reachable from entry points via import graph analysis are included, and
test files are automatically excluded (see
[Import Graph Filtering](#import-graph-filtering)).

```text
dist/npm/
├── index.d.ts
├── utils/helpers.d.ts
└── types/config.d.ts
```

### Console Output

When fallback occurs, you'll see a warning:

```text
warn    [npm] API Extractor failed, copying unbundled declarations
info    [npm] Copied 5 unbundled declaration file(s)
```

---

## Troubleshooting

### Declaration files not generated

**Symptom:** No `.d.ts` files in output

**Solutions:**

1. Ensure `@typescript/native-preview` is installed:

   ```bash
   bun add -D @typescript/native-preview
   ```

2. Check tsconfig has declaration support:

   ```json
   {
     "compilerOptions": {
       "declaration": true
     }
   }
   ```

3. Check for TypeScript errors:

   ```bash
   bun run tsgo --noEmit
   ```

### API Extractor warnings

**Symptom:** TSDoc warnings during build (with source location info)

**Solutions:**

1. Enable TSDoc linting to catch issues early:

   ```typescript
   export default BunLibraryBuilder.create({
     apiModel: {
       tsdoc: { lint: true },
     },
   });
   ```

2. Fix TSDoc comment syntax (see [TSDoc Reference](https://tsdoc.org/))

3. Control warning behavior with `tsdoc.warnings`:

   ```typescript
   export default BunLibraryBuilder.create({
     apiModel: {
       tsdoc: {
         warnings: 'none', // Suppress TSDoc warnings
       },
     },
   });
   ```

4. For forgotten export warnings, use `forgottenExports: 'ignore'` to suppress

### Missing types in bundled output

**Symptom:** Types from dependencies not included

**Solutions:**

1. Add the package to `dtsBundledPackages`:

   ```typescript
   export default BunLibraryBuilder.create({
     dtsBundledPackages: ['package-with-missing-types'],
   });
   ```

2. Ensure the dependency has proper type exports

### TypeScript version mismatch

**Symptom:** Warning about bundled TypeScript version

**Context:** API Extractor bundles its own TypeScript version which may differ
from your project. This is usually harmless.

**Solutions:**

1. The warning is automatically suppressed by bun-builder
2. If issues persist, align TypeScript versions in your project

### Build fails with "Declaration file not found"

**Symptom:**

```text
error   [npm] Declaration file not found: .bun-builder/declarations/npm/src/index.d.ts
```

**Solutions:**

1. Verify your main entry point path is correct
2. Check for TypeScript compilation errors
3. Ensure source files are in the expected location

---

## Performance Tips

### Optimize Declaration Generation

1. **Use project references** for large monorepos
2. **Test files are excluded automatically** -- Import graph filtering removes
   `.test.d.ts`, `.spec.d.ts`, and files in `__test__`/`__tests__` directories
3. **Minimize deep import chains** to speed up bundling

### Cache Considerations

The builder automatically cleans `.tsbuildinfo` files to ensure fresh builds.
If you need incremental builds, consider:

- Using a dedicated build tsconfig with incremental: true
- Running tsgo manually for development

---

## Related Documentation

- [Configuration Reference](./configuration.md) - All builder options
- [Advanced Usage](./advanced-usage.md) - Programmatic API
- [API Extractor Documentation](https://api-extractor.com/)
- [TSDoc Reference](https://tsdoc.org/)
