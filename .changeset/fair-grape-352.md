---
"@savvy-web/bun-builder": minor
---

Initial release of @savvy-web/bun-builder - a high-performance build system for modern ESM Node.js libraries using Bun's native bundler.

## Features

- **Fast Builds**: Uses Bun's native bundler for sub-second build times
- **Automatic Entry Detection**: Extracts entry points from package.json `exports` and `bin` fields
- **Declaration Bundling**: Generates rolled-up `.d.ts` files via tsgo + API Extractor
- **Catalog Resolution**: Resolves Bun's `catalog:` and `workspace:` protocols for npm publishing
- **Multi-Target Builds**: Single configuration produces both `dev` and `npm` outputs
- **TSDoc Validation**: Optional pre-build documentation linting with eslint-plugin-tsdoc
- **API Model Generation**: Generate API model JSON files for documentation tools
- **Package.json Transformation**: Automatic path conversion, type declarations, and field cleanup

## Usage

```typescript
import { BunLibraryBuilder } from '@savvy-web/bun-builder';

export default BunLibraryBuilder.create({
  externals: ['lodash'],
  dtsBundledPackages: ['type-fest'],
  tsdocLint: true,
  apiModel: true,
});
```

Build with `bun run bun.config.ts` or target specific outputs with `--env-mode dev` or `--env-mode npm`.
