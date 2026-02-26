# Advanced Usage

Advanced patterns for using `@savvy-web/bun-builder` programmatically and
extending its functionality.

## Table of Contents

- [Programmatic API](#programmatic-api)
- [Custom Build Pipelines](#custom-build-pipelines)
- [Transform Files Callback](#transform-files-callback)
- [Custom Bun Plugins](#custom-bun-plugins)
- [Monorepo Integration](#monorepo-integration)
- [CI/CD Integration](#cicd-integration)
- [Type Exports](#type-exports)

---

## Programmatic API

### Using BunLibraryBuilder Class

For advanced use cases, use the class directly instead of the static `create()` method:

```typescript
import type { BuildResult, BuildMode } from '@savvy-web/bun-builder';
import { BunLibraryBuilder } from '@savvy-web/bun-builder';

async function buildLibrary(): Promise<void> {
  const builder = new BunLibraryBuilder({
    externals: ['lodash'],
    dtsBundledPackages: ['type-fest'],
  });

  // Build specific targets
  const results: BuildResult[] = await builder.run(['npm']);

  // Check results
  const failed = results.filter(r => !r.success);
  if (failed.length > 0) {
    console.error('Build failed:', failed);
    process.exit(1);
  }

  // Access build information
  for (const result of results) {
    console.log(`Mode: ${result.mode}`);
    console.log(`Duration: ${result.duration}ms`);
    console.log(`Output files: ${result.outputs.length}`);
  }
}

buildLibrary();
```

### Building Single Modes

Use the `build()` method for more control over individual build modes:

```typescript
import type { BuildResult } from '@savvy-web/bun-builder';
import { BunLibraryBuilder } from '@savvy-web/bun-builder';

async function buildNpmOnly(): Promise<void> {
  const builder = new BunLibraryBuilder({});

  // Build only the npm mode (no banner, less logging)
  const result: BuildResult = await builder.build('npm');

  if (!result.success) {
    console.error('Build failed:', result.errors);
    process.exit(1);
  }

  console.log(`Built to: ${result.outdir}`);
}
```

### BuildResult Interface

```typescript
interface BuildResult {
  success: boolean;          // Whether build succeeded
  mode: 'dev' | 'npm';      // Build mode
  outdir: string;            // Absolute path to output directory
  outputs: string[];         // Absolute paths to output files
  duration: number;          // Build duration in milliseconds
  errors?: Error[];          // Errors if success is false
}
```

---

## Custom Build Pipelines

### Pre-Build Validation

Run validation before the build:

```typescript
import { BunLibraryBuilder } from '@savvy-web/bun-builder';
import { readFileSync } from 'node:fs';

async function buildWithValidation(): Promise<void> {
  // Pre-build checks
  const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));

  if (!pkg.version) {
    throw new Error('package.json must have a version');
  }

  if (!pkg.exports) {
    throw new Error('package.json must have exports');
  }

  // Run build
  await BunLibraryBuilder.create({});
}

buildWithValidation();
```

### Post-Build Processing

Add custom processing after the build:

```typescript
import { BunLibraryBuilder } from '@savvy-web/bun-builder';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

async function buildWithPostProcessing(): Promise<void> {
  const results = await BunLibraryBuilder.create({});

  for (const result of results) {
    if (!result.success) continue;

    // Add a version file to each output
    const versionFile = join(result.outdir, 'VERSION');
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    writeFileSync(versionFile, pkg.version);

    console.log(`Added VERSION file to ${result.outdir}`);
  }
}

buildWithPostProcessing();
```

---

## Transform Files Callback

The `transformFiles` callback provides access to build outputs for modification.

### Adding Generated Files

```typescript
import type { TransformFilesCallback } from '@savvy-web/bun-builder';
import { BunLibraryBuilder } from '@savvy-web/bun-builder';

const transformFiles: TransformFilesCallback = async (context) => {
  // Generate a build manifest
  const manifest = {
    version: '1.0.0',
    buildDate: new Date().toISOString(),
    mode: context.mode,
    files: Array.from(context.filesArray),
  };

  // Add to outputs
  const content = JSON.stringify(manifest, null, 2);
  context.outputs.set('build-manifest.json', content);

  // Include in package files
  context.filesArray.add('build-manifest.json');
};

export default BunLibraryBuilder.create({ transformFiles });
```

### Modifying Existing Files

```typescript
import type { TransformFilesCallback } from '@savvy-web/bun-builder';

const transformFiles: TransformFilesCallback = async (context) => {
  // Get existing output
  const indexJs = context.outputs.get('index.js');
  if (!indexJs) return;

  // Convert to string if needed
  const content = typeof indexJs === 'string'
    ? indexJs
    : new TextDecoder().decode(indexJs);

  // Add banner
  const banner = `/**
 * @license MIT
 * Built: ${new Date().toISOString()}
 */\n`;

  // Update the output
  context.outputs.set('index.js', banner + content);
};

export default BunLibraryBuilder.create({ transformFiles });
```

### Conditional Processing

```typescript
import type { TransformFilesCallback } from '@savvy-web/bun-builder';

const transformFiles: TransformFilesCallback = async (context) => {
  // Only for npm mode
  if (context.mode !== 'npm') return;

  // Add npm-specific files
  const npmrc = 'registry=https://registry.npmjs.org/';
  context.outputs.set('.npmrc', npmrc);
  context.filesArray.add('.npmrc');
};

export default BunLibraryBuilder.create({ transformFiles });
```

---

## Custom Bun Plugins

### Basic Plugin Structure

```typescript
import type { BunPlugin } from 'bun';
import { BunLibraryBuilder } from '@savvy-web/bun-builder';

const myPlugin: BunPlugin = {
  name: 'my-plugin',
  setup(build) {
    // Filter specific imports
    build.onResolve({ filter: /^virtual:/ }, (args) => {
      return {
        path: args.path,
        namespace: 'virtual',
      };
    });

    // Provide virtual module content
    build.onLoad({ filter: /.*/, namespace: 'virtual' }, (args) => {
      return {
        contents: `export default "virtual content"`,
        loader: 'ts',
      };
    });
  },
};

export default BunLibraryBuilder.create({
  plugins: [myPlugin],
});
```

### Asset Handling Plugin

```typescript
import type { BunPlugin } from 'bun';
import { readFileSync } from 'node:fs';

const assetPlugin: BunPlugin = {
  name: 'asset-plugin',
  setup(build) {
    build.onResolve({ filter: /\.(png|jpg|svg)$/ }, (args) => {
      return {
        path: args.path,
        namespace: 'asset',
      };
    });

    build.onLoad({ filter: /.*/, namespace: 'asset' }, (args) => {
      const data = readFileSync(args.path);
      const base64 = data.toString('base64');
      const ext = args.path.split('.').pop();
      const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;

      return {
        contents: `export default "data:${mime};base64,${base64}"`,
        loader: 'ts',
      };
    });
  },
};

export default BunLibraryBuilder.create({
  plugins: [assetPlugin],
});
```

### Environment Variables Plugin

```typescript
import type { BunPlugin } from 'bun';

const envPlugin: BunPlugin = {
  name: 'env-plugin',
  setup(build) {
    build.onResolve({ filter: /^env:/ }, (args) => {
      return {
        path: args.path,
        namespace: 'env',
      };
    });

    build.onLoad({ filter: /.*/, namespace: 'env' }, (args) => {
      const varName = args.path.replace('env:', '');
      const value = process.env[varName] ?? '';

      return {
        contents: `export default ${JSON.stringify(value)}`,
        loader: 'ts',
      };
    });
  },
};

export default BunLibraryBuilder.create({
  plugins: [envPlugin],
});
```

---

## Monorepo Integration

### Bun Workspaces

bun-builder supports Bun workspace catalogs for centralized dependency management:

```json
{
  "workspaces": {
    "packages": ["packages/*"],
    "catalog": {
      "react": "^19.0.0",
      "typescript": "^5.9.0"
    }
  }
}
```

Package files can reference catalog versions:

```json
{
  "dependencies": {
    "react": "catalog:"
  }
}
```

During npm builds, `catalog:` references are automatically resolved to their
actual version numbers.

### Turborepo Integration

Example `turbo.json` configuration:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "build:dev": {
      "dependsOn": ["^build"],
      "outputs": ["dist/dev/**"]
    },
    "build:npm": {
      "dependsOn": ["^build"],
      "outputs": ["dist/npm/**"]
    }
  }
}
```

### Cross-Package References

For packages that depend on other workspace packages:

```typescript
export default BunLibraryBuilder.create({
  // Ensure workspace packages are external
  externals: [
    /^@my-org\//,  // All @my-org packages
  ],
});
```

---

## CI/CD Integration

### GitHub Actions

```yaml
name: Build and Publish

on:
  push:
    branches: [main]
  release:
    types: [published]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Build
        run: bun run build:npm

      - name: Publish
        if: github.event_name == 'release'
        run: npm publish ./dist/npm
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

### Environment-Aware Configuration

The builder automatically adjusts behavior based on CI detection, but you can
customize further:

```typescript
import { BunLibraryBuilder } from '@savvy-web/bun-builder';

export default BunLibraryBuilder.create({
  apiModel: {
    enabled: true,
    forgottenExports: 'include', // Less strict locally, auto "error" in CI
    tsdoc: {
      lint: {
        enabled: true,
        onError: 'error', // Auto "throw" in CI
      },
    },
  },
});
```

### Exit Codes

The builder sets appropriate exit codes:

| Code | Meaning |
| --- | --- |
| 0 | All targets built successfully |
| 1 | One or more targets failed |

Example error handling:

```typescript
import { BunLibraryBuilder } from '@savvy-web/bun-builder';

async function build(): Promise<void> {
  const results = await BunLibraryBuilder.create({});

  const failed = results.filter(r => !r.success);

  if (failed.length > 0) {
    console.error(`${failed.length} target(s) failed`);
    for (const result of failed) {
      console.error(`  - ${result.mode}: ${result.errors?.[0]?.message}`);
    }
    process.exit(1);
  }

  process.exit(0);
}

build();
```

---

## Type Exports

All types are exported for use in your build configuration:

```typescript
import type {
  // Main builder types
  BunLibraryBuilderOptions,
  BuildMode,
  BuildResult,

  // Publish target
  PublishTarget,

  // Transform types
  TransformPackageJsonFn,
  TransformFilesCallback,
  TransformFilesContext,

  // Copy and virtual entry patterns
  CopyPatternConfig,
  VirtualEntryConfig,

  // TSDoc options
  TsDocLintOptions,
  TsDocLintErrorBehavior,
  TsDocOptions,
  TsDocTagDefinition,
  TsDocTagGroup,

  // API model options
  ApiModelOptions,
  TsDocMetadataOptions,

  // Entry points
  EntryPoints,

  // Package.json type
  PackageJson,
} from '@savvy-web/bun-builder';
```

---

## Related Documentation

- [Configuration Reference](./configuration.md) - All builder options
- [Package.json Transformation](./package-json-transformation.md) - How package.json is transformed
- [Declaration Bundling](./declaration-bundling.md) - TypeScript declaration handling
