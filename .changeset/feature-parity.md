---
"@savvy-web/bun-builder": minor
---

### Features

- Add TSDoc linting with `eslint-plugin-tsdoc` and ImportGraph-based file discovery
- Add TsDocConfigBuilder for generating and persisting tsdoc.json configuration
- Add TsconfigResolver for emitting resolved tsconfig.json for documentation tools
- Add tsdoc.json persistence to project root for IDE integration

### Improvements

- Replace `glob` and `tmp` npm packages with Bun-native methods (`Bun.Glob`, `os.tmpdir()`)
- Refactor to class-based API patterns with static methods
- Move constants into classes as static properties (BunCatalogResolver, TsconfigResolver)
- Add static convenience methods: `BunCatalogResolver.getDefault()`, `EntryExtractor.fromPackageJson()`
- Reduce public API surface to only `BunLibraryBuilder` and types

### Documentation

- Streamline README with links to detailed configuration docs
- Add TypeScript configuration section explaining bundled tsconfig
- Update design documentation to reflect current API
