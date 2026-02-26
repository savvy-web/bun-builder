---
status: current
module: bun-builder
category: testing
created: 2026-02-26
updated: 2026-02-26
last-synced: 2026-02-26
completeness: 95
related:
  - bun-builder/architecture.md
dependencies: []
---

# Testing Strategy

Test organization, E2E infrastructure, and coverage configuration for
`@savvy-web/bun-builder` using Bun's built-in test runner.

## Table of Contents

1. [Overview](#overview)
2. [Test Organization](#test-organization)
3. [Testing Approach](#testing-approach)
4. [E2E Testing Infrastructure](#e2e-testing-infrastructure)
5. [Coverage Configuration](#coverage-configuration)
6. [Running Tests](#running-tests)
7. [Related Documentation](#related-documentation)

---

## Overview

The testing strategy prioritizes:

- **Co-location**: Test files live next to source files for discoverability
- **Type safety**: No `any` types; create proper mock types
- **Two-tier testing**: Unit tests for utilities, E2E tests for build pipeline
- **Coverage awareness**: Path ignore patterns for runtime-only orchestration
  files, v8 ignore markers for future-proofing

**When to reference this document:**

- When writing new tests for plugins or utilities
- When adding E2E tests for builder options
- When debugging coverage configuration
- When understanding the fixture structure

---

## Test Organization

Tests are organized in two tiers: unit/integration tests co-located with source
files, and end-to-end tests in a dedicated `__test__/` directory.

### Co-located Unit/Integration Tests

```text
src/
├── builders/
│   ├── bun-library-builder.ts
│   └── bun-library-builder.test.ts
├── hooks/
│   ├── build-lifecycle.ts
│   └── build-lifecycle.test.ts
├── plugins/utils/
│   ├── entry-extractor.ts
│   ├── entry-extractor.test.ts
│   ├── catalog-resolver.ts
│   ├── catalog-resolver.test.ts
│   ├── logger.ts
│   ├── logger.test.ts
│   ├── tsdoc-config-builder.ts
│   ├── tsdoc-config-builder.test.ts
│   └── ...
```

### End-to-End Tests

```text
__test__/
├── e2e/
│   ├── bundle-mode.e2e.test.ts
│   ├── bundleless-mode.e2e.test.ts
│   ├── publish-targets.e2e.test.ts
│   └── utils/
│       ├── build-fixture.ts
│       └── assertions.ts
└── fixtures/
    ├── single-entry/
    │   ├── src/index.ts
    │   ├── src/helper.ts
    │   ├── src/helper.test.ts
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── LICENSE
    ├── bundleless-entry/
    │   ├── src/index.ts
    │   ├── src/utils/helper.ts
    │   ├── src/helper.test.ts
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── LICENSE
    └── multi-target/
        ├── src/index.ts
        ├── package.json
        ├── tsconfig.json
        └── LICENSE
```

---

## Testing Approach

### Unit Tests

- Test utility functions in isolation
- Mock filesystem operations
- Verify transformations produce expected output

### Integration Tests

- Test build lifecycle with mock context
- Verify phase interactions
- Test error handling paths

### End-to-End Tests

E2E tests validate complete build pipeline behavior by running actual builds
against fixture projects:

- **Bundle mode tests** (`bundle-mode.e2e.test.ts`): 7 tests verifying bundle
  mode output structure, correct JS output, declaration generation, and test
  file exclusion (e.g., `helper.test.d.ts` should not appear in output)
- **Bundleless mode tests** (`bundleless-mode.e2e.test.ts`): 9 tests verifying
  bundleless mode preserves source directory structure (`utils/helper.js`),
  emits raw `.d.ts` files per source file, excludes test `.d.ts` and `.test.js`
  files via ImportGraph filtering, produces `package.json` and copies LICENSE
- **Publish targets tests** (`publish-targets.e2e.test.ts`): 11 tests verifying
  multi-target artifact copying - JS bundles, .d.ts files, LICENSE, README, and
  package.json are all present in each target directory

### Type Safety

- Never use `as any`
- Create proper mock types
- Test type exports

---

## E2E Testing Infrastructure

### buildFixture()

**Location:** `__test__/e2e/utils/build-fixture.ts`

Copies a fixture directory to a temporary directory, generates a `bun.config.ts`
with the specified builder options, runs the build via `Bun.spawn`, and collects
output artifacts for assertions.

**Key features:**

- **Isolated builds**: Each test gets its own temp copy
- **Config generation**: Tests pass builder options directly
- **Output collection**: All generated files collected for assertion

### cleanStaleTempDirs()

**Location:** `__test__/e2e/utils/build-fixture.ts`

Cleans up stale temporary directories from previous test runs (older than
1 hour) to prevent accumulation from killed tests. Called in `beforeAll` of each
E2E suite.

The `clean:e2e` script (`rm -rf .bun-builder/e2e-temp`) provides manual cleanup.

### Assertion Helpers

**Location:** `__test__/e2e/utils/assertions.ts`

Semantic assertions for E2E tests:

| Assertion | Purpose |
| --- | --- |
| `assertBuildSucceeded` | Verify build exit code is 0 |
| `assertOutputExists` | Check output file exists |
| `assertOutputNotExists` | Check output file does not exist |
| `assertNoOutputMatching` | Verify no files match a pattern |
| `assertOutputContains` | Check output file contains string |

### Fixture Conventions

Each fixture is a minimal package:

- Contains `package.json`, `tsconfig.json`, `LICENSE`, and `src/` directory
- Includes test files (`*.test.ts`) to verify they're excluded from output
- The `single-entry` fixture has a helper module to test multi-file bundling
- The `bundleless-entry` fixture has nested modules (`src/utils/helper.ts`) to
  test directory structure preservation
- The `multi-target` fixture has `publishConfig.targets` with npm + GitHub
  targets

---

## Coverage Configuration

Coverage is configured in `bunfig.toml`:

```toml
[test]
coverage = true
coverageDir = "coverage"
coverageReporter = ["text", "lcov"]
coverageSkipTestFiles = true
coveragePathIgnorePatterns = [
  "src/hooks/build-lifecycle.ts",
  "src/builders/bun-library-builder.ts",
  "src/plugins/utils/logger.ts",
  "src/tsconfig/index.ts",
  "src/plugins/utils/file-utils.ts",
  "src/plugins/utils/catalog-resolver.ts",
]
```

### Key Decisions

**Coverage always enabled:** `coverage = true` in bunfig.toml means coverage
reports (`text` + `lcov`) are always generated when running tests.

**No thresholds:** Thresholds are intentionally omitted. Bun enforces thresholds
per-file and does not support v8 ignore comments yet
([oven-sh/bun#7662](https://github.com/oven-sh/bun/issues/7662)), so threshold
checks fail when running individual test files. CI coverage is monitored via the
LCOV report.

**Path ignore patterns:** `coveragePathIgnorePatterns` excludes runtime-only
orchestration files that primarily invoke external tools (Bun.build, tsgo, API
Extractor), console output, and workspace filesystem traversal that cannot be
unit tested.

**v8 ignore markers:** Source files contain `/* v8 ignore */` markers as
documentation and future-proofing for when Bun adds v8 ignore comment support.
These markers have no effect currently but document which code paths are
intentionally not covered.

### Coverage Exclusions Rationale

| File | Why excluded |
| --- | --- |
| `build-lifecycle.ts` | Orchestration: invokes Bun.build, tsgo, API Extractor |
| `bun-library-builder.ts` | Top-level orchestration with CLI arg parsing |
| `logger.ts` | Console output formatting, color rendering |
| `index.ts` (tsconfig) | TSConfig template management, file I/O |
| `file-utils.ts` | Filesystem traversal, workspace root detection |
| `catalog-resolver.ts` | Workspace filesystem traversal, mtime caching |

---

## Running Tests

```bash
# Run all tests
bun test

# Run with coverage (always enabled via bunfig.toml, but explicit flag works)
bun test --coverage

# Watch mode
bun test --watch

# Run E2E tests only
bun test __test__/e2e/

# Clean stale E2E temp directories
bun run clean:e2e

# AI-friendly test output
bun run test:ai
```

---

## Related Documentation

**Internal Design Docs:**

- [Architecture](./architecture.md) - System architecture and test directory
  structure

**External Resources:**

- [Bun Test Runner](https://bun.sh/docs/cli/test) - Test runner documentation
- [Bun Test Coverage](https://bun.sh/docs/cli/test#coverage) - Coverage
  configuration

---

**Document Status:** Current - Covers test organization (unit + E2E), fixture
structure (single-entry, bundleless-entry, multi-target), buildFixture() and
cleanStaleTempDirs() utilities, coverage configuration in bunfig.toml with path
ignore patterns, v8 ignore markers as future-proofing, and clean:e2e script.
