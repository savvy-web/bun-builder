---
"@savvy-web/bun-builder": patch
---

Fix DTS rollup fail-fast errors, enable code splitting, and fix TSDoc config handling

- Replace silent DTS fallback with fail-fast errors when API Extractor fails
- Add `splitting` option (defaults to `true` for multi-entry, `false` for single-entry)
- Build TSDoc config in-memory via `TSDocConfigFile.loadFromObject()` so custom tag definitions work in both dev and npm modes without writing to disk before the build
- Fix tsdoc.json not persisting to project root when lint is enabled but not configured
- Log error details when builds return `success: false`
