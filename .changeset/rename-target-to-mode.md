---
"@savvy-web/bun-builder": minor
---

## Features 

Rename BuildTarget to BuildMode and implement publish target resolution with per-registry callback iteration.

### Breaking changes to public API types:

- BuildTarget type renamed to BuildMode
- BuildResult.target renamed to BuildResult.mode
- TransformPackageJsonFn context changed from { target, pkg } to { mode, target, pkg } where mode is BuildMode and target is PublishTarget or undefined
- TransformFilesContext.target renamed to .mode, with new .target for PublishTarget
- PublishTarget interface changed: protocol is now "npm" or "jsr" (was string), registry is string or null (was string), access/provenance/tag are now required fields

### New exports

- BuildMode type ("dev" or "npm")
- PublishProtocol type ("npm" or "jsr")
- PublishTarget interface aligned with workflow-release-action ResolvedTarget

### New features

- publishConfig.targets in package.json supports shorthand strings ("npm", "github", "jsr", URLs) and full target objects
- transform and transformFiles callbacks are invoked once per publish target when targets are configured
- writePackageJson writes a customized package.json per publish target directory
