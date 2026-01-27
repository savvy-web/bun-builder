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
- [Utility Classes](#utility-classes)
- [Type Exports](#type-exports)

---

## Programmatic API

### Using BunLibraryBuilder Class

For advanced use cases, use the class directly instead of the static `create()` method:

```typescript
import type { BuildResult, BuildTarget } from '@savvy-web/bun-builder';
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
    console.log(`Target: ${result.target}`);
    console.log(`Duration: ${result.duration}ms`);
    console.log(`Output files: ${result.outputs.length}`);
  }
}

buildLibrary();
```

### Building Single Targets

Use the `build()` method for more control over individual targets:

```typescript
import type { BuildResult } from '@savvy-web/bun-builder';
import { BunLibraryBuilder } from '@savvy-web/bun-builder';

async function buildNpmOnly(): Promise<void> {
  const builder = new BunLibraryBuilder({});

  // Build only the npm target (no banner, less logging)
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
  target: 'dev' | 'npm';     // Build target
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
    target: context.target,
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
  // Only for npm target
  if (context.target !== 'npm') return;

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
      - uses: actions/checkout@v4

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

```typescript
import { BunLibraryBuilder } from '@savvy-web/bun-builder';

const isCI = process.env.CI === 'true';

export default BunLibraryBuilder.create({
  // Stricter in CI
  tsdocLint: {
    enabled: true,
    onError: isCI ? 'throw' : 'error',
  },

  // Only generate API model in CI
  apiModel: isCI,
});
```

### Exit Codes

The builder sets appropriate exit codes:

| Code | Meaning                        |
|------|--------------------------------|
| 0    | All targets built successfully |
| 1    | One or more targets failed     |

Example error handling:

```typescript
import { BunLibraryBuilder } from '@savvy-web/bun-builder';

async function build(): Promise<void> {
  const results = await BunLibraryBuilder.create({});

  const failed = results.filter(r => !r.success);

  if (failed.length > 0) {
    console.error(`${failed.length} target(s) failed`);
    for (const result of failed) {
      console.error(`  - ${result.target}: ${result.errors?.[0]?.message}`);
    }
    process.exit(1);
  }

  process.exit(0);
}

build();
```

---

## Utility Classes

The package exports several utility classes for advanced use cases. All methods
are static for convenience.

### PackageJsonTransformer

Transforms package.json fields for build output compatibility.

```typescript
import { PackageJsonTransformer } from '@savvy-web/bun-builder';

// Transform a source path to output path
const jsPath = PackageJsonTransformer.transformExportPath('./src/index.ts');
// Returns: "./index.js"

// Create type declaration path from JS path
const dtsPath = PackageJsonTransformer.createTypePath('./index.js');
// Returns: "./index.d.ts"

// Transform exports field for build output
const exports = PackageJsonTransformer.transformExports({
  '.': './src/index.ts',
  './utils': './src/utils.ts',
});
// Returns: {
//   '.': { types: './index.d.ts', import: './index.js' },
//   './utils': { types: './utils.d.ts', import: './utils.js' }
// }

// Transform bin field
const bin = PackageJsonTransformer.transformBin({
  'my-cli': './src/cli.ts',
});
// Returns: { 'my-cli': './bin/my-cli.js' }

// Apply all build transformations to package.json
const transformed = PackageJsonTransformer.applyBuildTransformations(
  originalPackageJson,
  sourcePackageJson,
);
```

### FileSystemUtils

File system operations for build tooling.

```typescript
import { FileSystemUtils } from '@savvy-web/bun-builder';

// Check if a file exists
const result = await FileSystemUtils.fileExistsAsync('package.json');
if (result.assetExists) {
  console.log(`Found at: ${result.assetPath}`);
}

// Get package.json version
const version = await FileSystemUtils.packageJsonVersion();
// Returns: "1.0.0"

// Find workspace root (directory with workspaces field)
const root = FileSystemUtils.findWorkspaceRoot();
// Returns: "/path/to/workspace" or null

// Get API Extractor executable path
const apiExtractor = FileSystemUtils.getApiExtractorPath();

// Get tsgo binary path
const tsgo = FileSystemUtils.getTsgoBinPath();

// Get unscoped package name
const name = FileSystemUtils.getUnscopedPackageName('@savvy-web/bun-builder');
// Returns: "bun-builder"
```

### LocalPathValidator

Validates paths for the `apiModel.localPaths` feature.

```typescript
import { LocalPathValidator } from '@savvy-web/bun-builder';

// Validate multiple paths (throws if parent directories don't exist)
LocalPathValidator.validatePaths(process.cwd(), [
  '../docs/api/my-package',
  '../website/lib/packages/my-package',
]);

// Check if a single path is valid
const isValid = LocalPathValidator.isValidPath(process.cwd(), '../docs/api');
// Returns: true if parent directory exists
```

### BuildLogger

Logging and formatting utilities for build operations.

```typescript
import { BuildLogger } from '@savvy-web/bun-builder';

// Check environment
const isCI = BuildLogger.isCI();
const isTest = BuildLogger.isTestEnvironment();

// Format values
const time = BuildLogger.formatTime(1500);
// Returns: "1.50 s"

const size = BuildLogger.formatSize(10240);
// Returns: "10.00 kB"

// Create a timer
const timer = BuildLogger.createTimer();
// ... do work ...
console.log(`Completed in ${timer.format()}`);

// Create loggers
const logger = BuildLogger.createLogger('my-plugin');
logger.info('Processing...');
logger.warn('Something to note');
logger.error('Something failed');
logger.success('Completed!');

// Create environment-aware logger
const envLogger = BuildLogger.createEnvLogger('npm');
envLogger.info('Building...');
// Output: info    [npm] Building...

// Collect file info for output table
const files = await BuildLogger.collectFileInfo(outdir, ['index.js', 'index.d.ts']);
BuildLogger.printFileTable(files, outdir, 'npm');

// Print build summary
BuildLogger.printSummary(['dev', 'npm'], 1500);
```

### ApiModelConfigResolver

Resolves API model configuration options with environment variable support.

```typescript
import { ApiModelConfigResolver } from '@savvy-web/bun-builder';

// Resolve configuration from various input formats
const config = ApiModelConfigResolver.resolve(options.apiModel, 'my-package');

// config contains:
// {
//   enabled: true,
//   filename: 'my-package.api.json',
//   localPaths: [],
//   tsdocMetadataEnabled: true,
//   tsdocMetadataFilename: 'tsdoc-metadata.json',
// }

// Get local paths from BUN_BUILDER_LOCAL_PATHS environment variable
const envPaths = ApiModelConfigResolver.getEnvLocalPaths();

// Merge user paths with environment paths (user paths take precedence)
const allPaths = ApiModelConfigResolver.resolveLocalPaths(['../user/path']);
```

#### Environment Variable

The `BUN_BUILDER_LOCAL_PATHS` environment variable defines additional local paths
for copying build artifacts. Create a `.env.local` file:

```env
BUN_BUILDER_LOCAL_PATHS=../docs/api,../website/packages/my-lib
```

Paths are comma-separated. When both the environment variable and `apiModel.localPaths`
are set, the paths are merged with user-defined paths taking precedence (appearing first).

### EntryExtractor

Extracts entry points from package.json exports.

```typescript
import type { PackageJson } from '@savvy-web/bun-builder';
import { EntryExtractor } from '@savvy-web/bun-builder';

const packageJson: PackageJson = {
  exports: {
    '.': './src/index.ts',
    './utils': './src/utils.ts',
  },
};

const entries = EntryExtractor.extractEntries(packageJson);
// Returns: { index: './src/index.ts', utils: './src/utils.ts' }

// Also extracts from bin field
const binEntries = EntryExtractor.extractBinEntries(packageJson);
```

### BunCatalogResolver

Resolves Bun's `catalog:` and `workspace:` protocols.

```typescript
import type { PackageJson } from '@savvy-web/bun-builder';
import { BunCatalogResolver } from '@savvy-web/bun-builder';

const resolver = new BunCatalogResolver();

// Find workspace root
const root = resolver.findWorkspaceRoot();

// Get catalogs from workspace root
const catalogs = await resolver.getCatalogs();
// Returns: { default: { react: '^19.0.0' }, named: { testing: { vitest: '^4.0.0' } } }

// Resolve a single reference
const version = await resolver.resolveReference('catalog:', 'react');
// Returns: "^19.0.0"

// Resolve all references in a package.json
const packageJson: PackageJson = {
  dependencies: {
    react: 'catalog:',
    vitest: 'catalog:testing',
  },
};

const resolved = await resolver.resolvePackageJson(packageJson);
// Returns package.json with resolved versions
```

---

## Type Exports

All types are exported for use in your build configuration:

```typescript
import type {
  // Main builder types
  BunLibraryBuilderOptions,
  BuildTarget,
  BuildResult,

  // Transform types
  TransformPackageJsonFn,
  TransformFilesCallback,
  TransformFilesContext,

  // Copy patterns
  CopyPatternConfig,

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
