---
"@savvy-web/bun-builder": patch
---

Fix build failures and improve error diagnostics:

- Add `bunTarget` option (default: `"bun"`) to support Bun-specific APIs like `import { $ } from "bun"`
- Show detailed error messages from Bun.build() with file paths and line numbers instead of generic "Bundle failed"
- Fix entry naming collisions when multiple entries have the same filename (e.g., `src/index.ts` and `src/cli/index.ts`)
