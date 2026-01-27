---
"@savvy-web/bun-builder": minor
---

Add `BUN_BUILDER_LOCAL_PATHS` environment variable support and class-based API refactoring.

### New Features

- **Environment variable for local paths**: Define `BUN_BUILDER_LOCAL_PATHS` in `.env.local` or other `.env` files to specify paths for copying build artifacts without modifying the build configuration. Paths are comma-separated and merged with `apiModel.localPaths` if both are set.

- **Class-based utility API**: Refactored all utility functions into static methods on dedicated classes for better API organization:
  - `PackageJsonTransformer` - Package.json transformation utilities
  - `FileSystemUtils` - File system operations
  - `LocalPathValidator` - Path validation for localPaths feature
  - `BuildLogger` - Logging, timing, and formatting utilities
  - `ApiModelConfigResolver` - API model configuration resolution

### Improvements

- Improved test environment detection for Bun's test runner to suppress logging during tests
- Added comprehensive TSDoc documentation with `@remarks` and `@example` blocks for all public APIs
