---
"@savvy-web/bun-builder": patch
---

Fix multi-target artifact copying and ImportGraph-based DTS filtering

- Copy all build artifacts (JS, .d.ts, LICENSE, README) to additional publish target directories, not just package.json
- Filter declaration output using ImportGraph to exclude test files (.test.d.ts, .spec.d.ts) and unreachable sources
- Add stack trace logging when API Extractor fails for easier debugging
- Add E2E test infrastructure with fixture-based build verification
