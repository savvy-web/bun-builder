---
"@savvy-web/bun-builder": minor
---

Align bun-builder API with rslib-builder conventions:

- Add `bundle: false` bundleless mode that preserves source directory structure
- Collect and report TSDoc warnings from API Extractor with source locations instead of suppressing them
- Add source location info to forgotten export warnings
- Generate tsdoc-metadata.json only for the main entry point
- Set `enumMemberOrder: "preserve"` in API Extractor config
- Enable `reportUnsupportedHtmlElements` in TSDoc config
- Default `apiModel: true` and `bundle: true` via `DEFAULT_OPTIONS`
- Load `tsdoc.json` via `TSDocConfigFile.loadForFolder()` for API Extractor
