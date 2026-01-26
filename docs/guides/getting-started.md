# Getting Started

This guide walks you through setting up rslib-builder for your first project.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Basic Setup](#basic-setup)
- [Running Your First Build](#running-your-first-build)
- [Understanding the Output](#understanding-the-output)
- [Next Steps](#next-steps)

## Prerequisites

Before you begin, ensure you have:

- Node.js 24.x or later
- pnpm 10.x or later (npm/yarn also work but pnpm is recommended)
- TypeScript 5.9.x or later

## Installation

Install the package and its peer dependencies:

```bash
# Install rslib-builder
pnpm add -D @savvy-web/rslib-builder

# Install peer dependencies
pnpm add -D @rslib/core @microsoft/api-extractor @typescript/native-preview
```

## Basic Setup

### 1. Create rslib.config.ts

Create `rslib.config.ts` in your project root:

```typescript
import { NodeLibraryBuilder } from '@savvy-web/rslib-builder';

export default NodeLibraryBuilder.create({
  // Optional: customize the build
  externals: ['@rslib/core'],  // Don't bundle these
});
```

### 2. Configure package.json Exports

rslib-builder reads your exports field to determine entry points:

```json
{
  "name": "my-package",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./utils": "./src/utils/index.ts"
  }
}
```

### 3. Add Build Scripts

Add build scripts to your package.json:

```json
{
  "scripts": {
    "build": "rslib build --env-mode dev",
    "build:npm": "rslib build --env-mode npm"
  }
}
```

## Running Your First Build

### Development Build

Run a development build with source maps:

```bash
pnpm build
```

This creates `dist/dev/` with:

- Bundled JavaScript files
- Source maps for debugging
- TypeScript declarations
- Transformed package.json

### Production Build

Run a production build optimized for npm:

```bash
pnpm build:npm
```

This creates `dist/npm/` with:

- Optimized JavaScript (no source maps)
- Bundled TypeScript declarations
- Package.json ready for publishing

## Understanding the Output

After building, your dist directory looks like:

```text
dist/
├── dev/                     # Development build
│   ├── index.js            # Bundled entry
│   ├── index.js.map        # Source map
│   ├── index.d.ts          # Type declarations
│   ├── utils/
│   │   └── index.js        # Additional entries
│   └── package.json        # Transformed for local use
│
└── npm/                     # Production build
    ├── index.js            # Bundled entry (no source map)
    ├── index.d.ts          # Bundled declarations
    ├── utils/
    │   └── index.js
    └── package.json        # Ready for npm publish
```

### Package.json Transformations

The output package.json is transformed from the source:

**Source package.json:**

```json
{
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "lodash": "catalog:"
  }
}
```

**Output package.json:**

```json
{
  "exports": {
    ".": {
      "types": "./index.d.ts",
      "import": "./index.js"
    }
  },
  "dependencies": {
    "lodash": "^4.17.21"
  },
  "files": ["index.js", "index.d.ts", "package.json"]
}
```

Key transformations:

- Export paths updated from `.ts` to `.js`
- Type conditions added to exports
- PNPM `catalog:` references resolved to actual versions
- `files` array generated automatically

## Next Steps

Now that you have a basic build working:

- [Configuration Guide](./configuration.md) - Explore all options
- [Plugin System](./plugins.md) - Understand built-in plugins
- [Architecture Overview](../architecture/overview.md) - Learn how it works
- [Troubleshooting](../troubleshooting.md) - Solve common issues

## Common First-Time Issues

### "Cannot find module" errors

Ensure all imports use `.js` extensions (ESM requirement):

```typescript
// Correct
import { helper } from './utils/helper.js';

// Incorrect
import { helper } from './utils/helper';
```

### Types not generating

Verify peer dependencies are installed:

```bash
pnpm add -D @typescript/native-preview @microsoft/api-extractor
```

### Build takes too long

First builds are slower due to cache warming. Subsequent builds use the
`.rslib/cache/` directory and are much faster.
