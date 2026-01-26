# Declaration Bundling

How `@savvy-web/bun-builder` generates and bundles TypeScript declarations.

## Table of Contents

- [Overview](#overview)
- [Declaration Generation with tsgo](#declaration-generation-with-tsgo)
- [Declaration Bundling with API Extractor](#declaration-bundling-with-api-extractor)
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

- **Rolled-up declarations** - Single `.d.ts` file with all exports
- **API reports** - Documentation of your public API
- **API models** - JSON files for documentation generators

### Benefits of Bundled Declarations

| Feature             | Unbundled                    | Bundled              |
|---------------------|------------------------------|----------------------|
| File count          | Many `.d.ts` files           | Single `index.d.ts`  |
| IDE performance     | Slower (more files to parse) | Faster               |
| Package size        | Larger                       | Smaller              |
| Consumer experience | Scattered types              | Clean single entry   |

### Bundling Process

1. API Extractor reads the main entry point declaration
2. It follows imports to collect all related declarations
3. Internal types are inlined, public types are preserved
4. A single `index.d.ts` is written to the output directory

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

**After bundling:**

```text
dist/npm/
└── index.d.ts  (contains all types)
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

Instead of a single bundled file, individual `.d.ts` files are copied:

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

**Symptom:** TSDoc warnings during build

**Solutions:**

1. Enable TSDoc linting to catch issues early:

   ```typescript
   export default BunLibraryBuilder.create({
     tsdocLint: true,
   });
   ```

2. Fix TSDoc comment syntax (see [TSDoc Reference](https://tsdoc.org/))

3. Suppress specific warnings in API Extractor config (not recommended)

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
2. **Exclude test files** from declaration generation
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
