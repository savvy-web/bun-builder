# Troubleshooting

Common issues and solutions when using rslib-builder.

## Table of Contents

- [Build Errors](#build-errors)
- [Type Generation Issues](#type-generation-issues)
- [Package.json Problems](#packagejson-problems)
- [Performance Issues](#performance-issues)
- [Plugin Issues](#plugin-issues)

## Build Errors

### "Cannot find module" errors

**Symptom:** Build fails with module resolution errors.

**Common causes:**

1. **Missing `.js` extension in imports**

   ESM requires explicit file extensions:

   ```typescript
   // Wrong
   import { helper } from './utils/helper';

   // Correct
   import { helper } from './utils/helper.js';
   ```

2. **Missing peer dependencies**

   Install required peer dependencies:

   ```bash
   pnpm add -D @rslib/core @microsoft/api-extractor @typescript/native-preview
   ```

3. **Incorrect externals configuration**

   If you externalize a package, ensure it's available at runtime:

   ```typescript
   NodeLibraryBuilder.create({
     externals: ['@rslib/core'],  // Must be a peerDependency
   });
   ```

### "Invalid env-mode" error

**Symptom:** Error message about invalid build target.

**Solution:** Use a valid `--env-mode` value:

```bash
# Valid
rslib build --env-mode dev
rslib build --env-mode npm

# Invalid
rslib build --env-mode production  # Not a valid target
```

### Build hangs or times out

**Symptom:** Build process doesn't complete.

**Common causes:**

1. **Circular dependencies** - Check for import cycles
2. **Large node_modules** - Ensure externals are configured
3. **tsgo issues** - Try with a fresh `.rslib/` cache

**Solution:**

```bash
# Clear cache and rebuild
rm -rf .rslib/
rslib build --env-mode dev
```

## Type Generation Issues

### Types not generating

**Symptom:** No `.d.ts` files in output.

**Common causes:**

1. **Missing peer dependency**

   ```bash
   pnpm add -D @typescript/native-preview
   ```

2. **tsconfig issues** - Ensure your tsconfig is valid:

   ```bash
   npx tsc --noEmit  # Check for errors
   ```

3. **Entry point not in exports**

   Entries must be listed in package.json exports:

   ```json
   {
     "exports": {
       ".": "./src/index.ts"
     }
   }
   ```

### "Cannot find declaration file" errors

**Symptom:** Type errors about missing declarations.

**Solution:** Add packages to `dtsBundledPackages`:

```typescript
NodeLibraryBuilder.create({
  dtsBundledPackages: [
    'problematic-package',
    '@types/*',  // Bundle all @types
  ],
});
```

### API Extractor errors

**Symptom:** Errors during declaration bundling.

**Common causes:**

1. **Invalid TypeScript syntax** - Fix any TS errors first
2. **Circular type references** - Simplify complex type structures
3. **Missing types** - Add to `dtsBundledPackages`

**Debugging:**

Check the intermediate declarations:

```bash
ls .rslib/declarations/npm/
```

## Package.json Problems

### PNPM catalog references not resolved

**Symptom:** Output still contains `catalog:` references.

**Common causes:**

1. **Missing pnpm-workspace.yaml**

   Ensure you have a valid workspace configuration:

   ```yaml
   # pnpm-workspace.yaml
   catalog:
     lodash: ^4.17.21
   ```

2. **Package not in catalog**

   Add the package to your catalog:

   ```yaml
   catalog:
     missing-package: ^1.0.0
   ```

### exports field incorrect

**Symptom:** Output exports don't match expected structure.

**Check your source exports:**

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./utils": "./src/utils/index.ts"
  }
}
```

**Expected output:**

```json
{
  "exports": {
    ".": {
      "types": "./index.d.ts",
      "import": "./index.js"
    },
    "./utils": {
      "types": "./utils/index.d.ts",
      "import": "./utils/index.js"
    }
  }
}
```

### files array missing entries

**Symptom:** Some files not included in package.

**Solution:** Check that files are being emitted:

```bash
ls dist/npm/
```

If files exist but aren't in `files` array, use `transformFiles`:

```typescript
NodeLibraryBuilder.create({
  transformFiles({ filesArray }) {
    filesArray.add('my-missing-file.json');
  },
});
```

## Performance Issues

### Slow first build

**Expected behavior:** First builds are slower due to cache warming.

Subsequent builds use `.rslib/cache/` and are much faster.

**Tips:**

- Don't delete `.rslib/` between builds
- Add `.rslib/` to `.gitignore` but not `.dockerignore`

### Build gets slower over time

**Symptom:** Builds slow down as project grows.

**Solutions:**

1. **Review externals** - Externalize large dependencies:

   ```typescript
   NodeLibraryBuilder.create({
     externals: ['lodash', 'rxjs'],  // Don't bundle these
   });
   ```

2. **Clear cache periodically:**

   ```bash
   rm -rf .rslib/cache/
   ```

3. **Check for unnecessary files** - Ensure `copyPatterns` isn't
   copying too much:

   ```typescript
   copyPatterns: [
     // Be specific
     { from: './templates/*.json', context: './src' },
     // Avoid broad patterns like:
     // { from: './**/*', context: './src' }
   ],
   ```

### tsgo taking too long

**Symptom:** Declaration generation is slow.

**Solutions:**

1. **Check tsconfig strictness** - Looser configs compile faster
2. **Reduce included files** - Use tsconfig `include`/`exclude`
3. **Check for type complexity** - Simplify recursive/deep types

## Plugin Issues

### Custom plugin not running

**Symptom:** Your custom plugin doesn't seem to execute.

**Common causes:**

1. **Plugin added to wrong array:**

   ```typescript
   NodeLibraryBuilder.create({
     plugins: [myPlugin()],  // Correct location
   });
   ```

2. **Wrong stage in processAssets:**

   ```typescript
   // Ensure stage matches when your code should run
   api.processAssets({ stage: 'additional' }, async () => {
     // This runs AFTER 'optimize' stage
   });
   ```

3. **Plugin returning early:**

   Check for early returns in your plugin setup.

### Plugin conflicts

**Symptom:** Unexpected behavior when multiple plugins interact.

**Solution:** Check plugin execution order and shared state:

```typescript
api.processAssets({ stage: 'additional' }, async () => {
  const filesArray = api.useExposed('files-array');
  console.log('Current files:', [...filesArray]);  // Debug
});
```

### Shared state not available

**Symptom:** `api.useExposed()` returns undefined.

**Common causes:**

1. **Wrong timing** - State may not be exposed yet at your stage
2. **Wrong key name** - Check spelling of exposed keys
3. **Plugin order** - Ensure producing plugin runs first

**Valid shared state keys:**

- `files-array` - Available after FilesArrayPlugin initializes
- `entrypoints` - Available after AutoEntryPlugin runs
- `exportToOutputMap` - Available after AutoEntryPlugin runs

## Getting Help

If you can't resolve an issue:

1. **Check the build output** - Run with verbose logging:

   ```bash
   DEBUG=* rslib build --env-mode dev
   ```

2. **Inspect generated config:**

   ```bash
   rslib inspect --verbose
   ```

3. **Review intermediate files:**

   ```bash
   ls -la .rslib/
   ```

4. **Open an issue** - Include:
   - rslib-builder version
   - Node.js version
   - Minimal reproduction
   - Full error output
