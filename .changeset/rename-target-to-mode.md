---
"@savvy-web/bun-builder": minor
---

Rename `BuildTarget` to `BuildMode` and add `PublishTarget` type for per-registry package.json customization.

**Breaking changes to public API types:**

- `BuildTarget` type renamed to `BuildMode`
- `BuildResult.target` renamed to `BuildResult.mode`
- `TransformPackageJsonFn` context changed from `{ target, pkg }` to `{ mode, target, pkg }` where `mode` is `BuildMode` and `target` is `PublishTarget | undefined`
- `TransformFilesContext.target` renamed to `.mode`, with new `.target: PublishTarget | undefined`

**New exports:**

- `BuildMode` type (`"dev" | "npm"`)
- `PublishTarget` interface for publish destination metadata
