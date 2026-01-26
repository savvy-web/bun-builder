---
"@savvy-web/rslib-builder": minor
---

Add TsDocLintPlugin for pre-build TSDoc comment validation

This release introduces a new `TsDocLintPlugin` that programmatically runs ESLint
with `eslint-plugin-tsdoc` to validate TSDoc comments before the build process
begins. This helps catch documentation issues early in the development cycle.

**New Features:**

- `TsDocLintPlugin` - Standalone Rsbuild plugin for TSDoc validation
- `tsdocLint` option in `NodeLibraryBuilder` for easy integration
- Environment-aware defaults: throws errors in CI, logs errors locally
- Configuration sharing between `tsdocLint` and `apiModel` options
- Smart `tsdoc.json` persistence that avoids unnecessary file writes

**Configuration Options:**

```typescript
NodeLibraryBuilder.create({
  tsdocLint: {
    enabled: true,                    // Enable/disable linting
    onError: 'throw',                 // 'warn' | 'error' | 'throw'
    include: ['src/**/*.ts'],         // Files to lint
    persistConfig: true,              // Keep tsdoc.json for IDE integration
    tsdoc: {                          // Custom TSDoc tags
      tagDefinitions: [{ tagName: '@error', syntaxKind: 'block' }],
    },
  },
});
```

**Breaking Changes:** None. This is an opt-in feature.

**Dependencies:**

The plugin requires optional peer dependencies when enabled:

- `eslint`
- `@typescript-eslint/parser`
- `eslint-plugin-tsdoc`

If these packages are not installed, the plugin provides a helpful error message
explaining how to install them.

**Improvements:**

- `TsDocConfigBuilder.writeConfigFile()` now compares existing config files using
  deep equality to avoid unnecessary writes and uses tabs for formatting
- Added `deep-equal` package for robust object comparison
