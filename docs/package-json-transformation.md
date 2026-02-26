# Package.json Transformation

How `@savvy-web/bun-builder` transforms your package.json for build output.

## Table of Contents

- [Overview](#overview)
- [Export Path Transformation](#export-path-transformation)
- [Catalog Resolution](#catalog-resolution)
- [Files Array Generation](#files-array-generation)
- [Field Removal](#field-removal)
- [Custom Transform Callback](#custom-transform-callback)

---

## Overview

The builder applies several transformations to your source `package.json` when
writing to the output directory:

1. **Path transformations** - Convert TypeScript paths to JavaScript
2. **Catalog resolution** - Resolve `catalog:` and `workspace:` protocols (npm target only)
3. **Field cleanup** - Remove build-time fields
4. **Files array** - Add the `files` array from build outputs
5. **Custom transform** - Apply your transform function

---

## Export Path Transformation

### Source to Output Mapping

TypeScript export paths are converted to their JavaScript equivalents:

| Source Path | Output Path |
| --- | --- |
| `./src/index.ts` | `./index.js` |
| `./src/utils/helpers.ts` | `./utils/helpers.js` |
| `./exports/api.ts` | `./api.js` |

### Automatic Type Declarations

String exports are converted to conditional exports with type declarations:

**Input:**

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./utils": "./src/utils.ts"
  }
}
```

**Output:**

```json
{
  "exports": {
    ".": {
      "types": "./index.d.ts",
      "import": "./index.js"
    },
    "./utils": {
      "types": "./utils.d.ts",
      "import": "./utils.js"
    }
  }
}
```

### Prefix Stripping

The following directory prefixes are automatically stripped:

- `./src/` - Source directory
- `./exports/` - Exports directory
- `./public/` - Public assets directory

### Binary Path Transformation

Binary (`bin`) paths are transformed to a standard `./bin/` directory:

**Input:**

```json
{
  "bin": {
    "my-cli": "./src/bin/cli.ts"
  }
}
```

**Output:**

```json
{
  "bin": {
    "my-cli": "./bin/my-cli.js"
  }
}
```

---

## Catalog Resolution

Bun workspace catalogs provide centralized version management for monorepos.
The builder resolves these references for npm publishing.

### Catalog Format

Catalogs are defined in your workspace root `package.json`:

```json
{
  "workspaces": {
    "packages": ["packages/*"],
    "catalog": {
      "react": "^19.0.0",
      "lodash": "^4.17.21"
    },
    "catalogs": {
      "testing": {
        "vitest": "^4.0.0",
        "jest": "^29.0.0"
      }
    }
  }
}
```

### Reference Protocols

| Protocol | Description | Example |
| --- | --- | --- |
| `catalog:` | Default catalog | `"react": "catalog:"` |
| `catalog:<name>` | Named catalog | `"vitest": "catalog:testing"` |
| `workspace:*` | Local workspace package | `"@my-org/utils": "workspace:*"` |

### Resolution Example

**Input (source package.json):**

```json
{
  "dependencies": {
    "react": "catalog:",
    "vitest": "catalog:testing",
    "@my-org/utils": "workspace:*"
  }
}
```

**Output (npm build):**

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "vitest": "^4.0.0",
    "@my-org/utils": "1.0.0"
  }
}
```

### When Resolution Occurs

Catalog resolution only occurs for the **npm target**. The dev target preserves
the original references since it's not intended for publishing.

### Error Handling

If a catalog reference cannot be resolved, the build fails with an error:

```text
error   [catalog] Failed to resolve catalog: for react - not found in catalog
error   [catalog] Unresolved references remain in package.json:
error   [catalog]   - dependencies.react: catalog:
Error: 1 unresolved references would result in invalid package.json
```

---

## Files Array Generation

The builder automatically generates the `files` array based on build outputs.

### Automatic Inclusion

Files automatically added to the array:

- All bundled JavaScript files (`*.js`)
- Bundled declaration files (`*.d.ts`)
- Copied files (README.md, LICENSE, etc.)
- Public directory contents

### Automatic Exclusion

Files automatically excluded:

- Source maps (`*.map`)
- API model files (via negation pattern `!<pkg>.api.json`)

### Example Output

```json
{
  "files": [
    "index.js",
    "index.d.ts",
    "utils.js",
    "utils.d.ts",
    "README.md",
    "LICENSE",
    "package.json",
    "!my-package.api.json"
  ]
}
```

---

## Field Removal

The following fields are removed during transformation:

| Field | Reason |
| --- | --- |
| `publishConfig` | Build-time configuration, not needed in output |
| `scripts` | Build scripts not needed for consumers |

### Publish Targets

When `publishConfig.targets` is configured, the builder copies the complete set
of build artifacts to each additional target directory before writing the
per-target `package.json`. This means directories like `dist/github/` contain
the full build output (JS bundles, `.d.ts` declarations, LICENSE, README) -- not
just `package.json`.

### Private Field

The `private` field is set based on context:

- **Dev target**: Always `private: true` (prevents accidental publishing)
- **npm target**: Based on `publishConfig.access`
  - `"access": "public"` → `private: false`
  - Otherwise → `private: true`

---

## Custom Transform Callback

Apply custom modifications using the `transform` option:

```typescript
import type { TransformPackageJsonFn, PackageJson } from '@savvy-web/bun-builder';
import { BunLibraryBuilder } from '@savvy-web/bun-builder';

const transform: TransformPackageJsonFn = ({ mode, target, pkg }): PackageJson => {
  // Mode-specific modifications
  if (mode === 'npm') {
    // Remove devDependencies for npm
    delete pkg.devDependencies;

    // Remove build-related fields
    delete pkg.devEngines;
    delete pkg.bundleDependencies;
  }

  // Add custom metadata
  pkg.buildInfo = {
    builtAt: new Date().toISOString(),
    mode,
  };

  return pkg;
};

export default BunLibraryBuilder.create({ transform });
```

### Transform Context

The transform function receives:

| Property | Type | Description |
| --- | --- | --- |
| `mode` | `BuildMode` | Current build mode |
| `target` | `PublishTarget \| undefined` | Current publish target, if any |
| `pkg` | `PackageJson` | Package.json after standard transformations |

### Transform Timing

The transform is called **after** all standard transformations:

1. Catalog resolution (npm only)
2. Path transformations
3. Field removal
4. **Your transform function**
5. Files array addition
6. Write to output

---

## Transformation Pipeline

Complete transformation pipeline for `npm` target:

```text
Source package.json
        |
        v
+------------------------+
| resolveCatalogReferences()
| - Resolve catalog: refs
| - Resolve workspace:* refs
+------------------------+
        |
        v
+------------------------+
| applyBuildTransformations()
| - Remove publishConfig
| - Remove scripts
| - Set private flag
| - transformPackageExports()
|   - .ts -> .js
|   - Add types conditions
|   - Strip src/ prefix
| - transformPackageBin()
| - Sort fields
+------------------------+
        |
        v
+------------------------+
| User transform function
| - Custom modifications
+------------------------+
        |
        v
+------------------------+
| Add files array
| - From build outputs
| - Sorted alphabetically
+------------------------+
        |
        v
Write to dist/npm/package.json
        |
        v  (if publishConfig.targets)
+------------------------+
| Copy all build artifacts
| to each target directory
| (JS, .d.ts, LICENSE, README)
+------------------------+
        |
        v
Write per-target package.json
(e.g., dist/github/package.json)
```

---

## Examples

### Input Package.json

```json
{
  "name": "my-library",
  "version": "1.0.0",
  "description": "A sample library",
  "exports": {
    ".": "./src/index.ts",
    "./utils": "./src/utils/index.ts"
  },
  "bin": {
    "my-cli": "./src/bin/cli.ts"
  },
  "dependencies": {
    "lodash": "catalog:",
    "@my-org/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.9.0"
  },
  "scripts": {
    "build": "bun run bun.config.ts",
    "test": "bun test"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

### Output Package.json (npm target)

```json
{
  "name": "my-library",
  "version": "1.0.0",
  "description": "A sample library",
  "exports": {
    ".": {
      "types": "./index.d.ts",
      "import": "./index.js"
    },
    "./utils": {
      "types": "./utils.d.ts",
      "import": "./utils.js"
    }
  },
  "bin": {
    "my-cli": "./bin/my-cli.js"
  },
  "dependencies": {
    "lodash": "^4.17.21",
    "@my-org/core": "2.0.0"
  },
  "devDependencies": {
    "typescript": "^5.9.0"
  },
  "files": [
    "bin/my-cli.js",
    "index.d.ts",
    "index.js",
    "LICENSE",
    "package.json",
    "README.md",
    "utils.d.ts",
    "utils.js"
  ],
  "private": false
}
```
