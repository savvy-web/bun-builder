# Contributing to @savvy-web/bun-builder

Thank you for your interest in contributing! This guide covers the development
workflow and standards for this project.

## Prerequisites

- **Bun** >= 1.3.0
- **Node.js** >= 20.0.0 (for peer dependencies)
- **TypeScript** >= 5.9.0

## Getting Started

```bash
# Clone the repository
git clone https://github.com/savvy-web/bun-builder.git
cd bun-builder

# Install dependencies
bun install
```

## Development Workflow

### Building

This project uses `BunLibraryBuilder` to build itself (self-building).

```bash
# Build both dev and npm targets
bun run build

# Development build only (with source maps)
bun run build:dev

# npm build only (optimized for publishing)
bun run build:npm

# Build in CI mode (stricter validation)
bun run ci:build
```

The build configuration is in `bun.config.ts`:

```typescript
import { BunLibraryBuilder } from "./src/index.js";

export default BunLibraryBuilder.create({
  externals: [
    "@microsoft/api-extractor",
    "@typescript/native-preview",
    "typescript",
    "eslint",
    "@typescript-eslint/parser",
    "eslint-plugin-tsdoc",
  ],
  dtsBundledPackages: ["picocolors", "type-fest"],
  apiModel: { enabled: true },
  tsdocLint: { enabled: true, onError: "error" },
});
```

### Testing

Tests use Bun's built-in test runner and are co-located with source files.

```bash
# Run all tests
bun test

# Run with coverage report
bun test --coverage

# Watch mode for development
bun test --watch
```

#### Test Coverage Requirements

- Maintain high coverage per file
- Use type-safe mocks from `src/__test__/` utilities
- Never use `as any` - create proper mock interfaces

#### Writing Tests

```typescript
import { describe, expect, it } from 'bun:test';
import { EntryExtractor } from './entry-extractor.js';

describe('EntryExtractor', () => {
  it('extracts entries from package.json exports', () => {
    const extractor = new EntryExtractor();
    const result = extractor.extract({
      exports: { '.': './src/index.ts' },
    });

    expect(result.entries).toEqual({
      index: './src/index.ts',
    });
  });
});
```

### Type Checking

```bash
# Run type checking with tsgo
bun run typecheck
```

### Linting

This project uses [Biome](https://biomejs.dev/) for linting and formatting.

```bash
# Check for issues
bun run lint

# Auto-fix safe issues
bun run lint:fix

# Auto-fix including unsafe fixes
bun run lint:fix:unsafe

# Lint markdown files
bun run lint:md

# Lint TSDoc comments
bun run lint:tsdoc
```

## Project Structure

```text
bun-builder/
├── src/
│   ├── index.ts                 # Main exports
│   ├── builders/
│   │   ├── bun-library-builder.ts      # Main builder class
│   │   └── bun-library-builder.test.ts
│   ├── hooks/
│   │   ├── build-lifecycle.ts   # Build phase implementations
│   │   └── build-lifecycle.test.ts
│   ├── plugins/utils/
│   │   ├── entry-extractor.ts   # Entry point detection
│   │   ├── catalog-resolver.ts  # Catalog protocol resolution
│   │   ├── package-json-transformer.ts
│   │   ├── file-utils.ts
│   │   └── logger.ts
│   ├── macros/
│   │   └── version.ts           # Compile-time version macro
│   ├── tsconfig/
│   │   └── index.ts             # TSConfig management
│   ├── public/
│   │   └── tsconfig/            # Base tsconfig JSON files
│   └── types/
│       ├── builder-types.ts     # Builder option types
│       └── package-json.ts      # PackageJson type
├── docs/                        # User documentation
├── bun.config.ts                # Self-builds using BunLibraryBuilder
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Code Standards

### TypeScript

- No `any` types - use proper interfaces
- Use `import type` for type-only imports
- All imports must use `.js` extension (ESM requirement)
- Add TSDoc comments for all public APIs

### TSDoc Requirements

All public APIs must have TSDoc comments:

```typescript
/**
 * Brief description of the function.
 *
 * @remarks
 * Additional details about behavior, usage notes, etc.
 *
 * @param options - Description of the parameter
 * @returns Description of the return value
 *
 * @example
 * ```typescript
 * const result = myFunction({ key: 'value' });
 * ```
 *
 * @public
 */
export function myFunction(options: Options): Result {
  // ...
}
```

### Test Standards

- Co-locate tests with source files (`*.test.ts`)
- Use shared mock types from `src/__test__/`
- Avoid mocking external modules when possible

## Making Changes

### Adding New Features

1. Create a feature branch from `main`
2. Add or modify source files in `src/`
3. Add tests for new functionality
4. Update TSDoc comments
5. Run `bun test` and `bun run lint:fix`
6. Update documentation if needed

### Modifying the Build Pipeline

The build pipeline is defined in `src/hooks/build-lifecycle.ts`. When modifying:

1. Understand the [build phases](./docs/declaration-bundling.md)
2. Maintain backward compatibility
3. Update the architecture documentation in `.claude/design/`
4. Add tests for new phases

### Adding Configuration Options

1. Add the type to `src/types/builder-types.ts`
2. Document with TSDoc comments
3. Implement in `src/hooks/build-lifecycle.ts`
4. Update `docs/configuration.md`
5. Add tests

## Troubleshooting

### Build Failures

**Problem**: Build fails with "Cannot find module"

**Solution**: Check imports use `.js` extension:

```typescript
// Correct
import { foo } from './utils.js';

// Incorrect
import { foo } from './utils';
```

**Problem**: Types not resolving

**Solution**: Verify `dtsBundledPackages` includes necessary packages

### Test Failures

**Problem**: Mock types not matching

**Solution**: Import types using `import type`, create minimal mocks:

```typescript
import type { PackageJson } from '../types/package-json.js';

const mockPackageJson: PackageJson = {
  name: 'test',
  version: '1.0.0',
};
```

### Declaration Generation Issues

**Problem**: tsgo fails with type errors

**Solution**: Run type checking first:

```bash
bun run typecheck
```

**Problem**: API Extractor warnings

**Solution**: Enable TSDoc linting and fix reported issues:

```bash
bun run lint:tsdoc
```

## Developer Certificate of Origin (DCO)

This project requires all contributions to be signed off under the
[Developer Certificate of Origin (DCO)](./DCO). This certifies that you have
the right to submit your contribution under the project's open source license.

### How to Sign Off

Add a `Signed-off-by` line to your commit messages:

```text
Signed-off-by: Your Name <your.email@example.com>
```

Git can do this automatically with the `-s` flag:

```bash
git commit -s -m "Your commit message"
```

### Configuring Git

Ensure your Git identity matches your sign-off:

```bash
git config user.name "Your Name"
git config user.email "your.email@example.com"
```

## Pull Request Guidelines

1. Create a feature branch from `main`
2. Ensure all tests pass
3. Run `bun run lint:fix` before committing
4. Sign off all commits (see DCO above)
5. Write clear commit messages
6. Update documentation as needed
7. Keep PRs focused on a single change

### PR Checklist

- [ ] Tests added/updated
- [ ] TSDoc comments added for public APIs
- [ ] Documentation updated (if user-facing)
- [ ] `bun test` passes
- [ ] `bun run lint` passes
- [ ] `bun run typecheck` passes
- [ ] Commits signed off

## External Resources

- [Bun Documentation](https://bun.sh/docs)
- [Bun.build() API](https://bun.sh/docs/bundler)
- [API Extractor](https://api-extractor.com/)
- [TSDoc Reference](https://tsdoc.org/)
- [Biome](https://biomejs.dev/)

## License

By contributing and signing off your commits, you agree that your contributions
will be licensed under the MIT License and certify compliance with the
[Developer Certificate of Origin](./DCO).
