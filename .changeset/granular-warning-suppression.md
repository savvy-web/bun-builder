---
"@savvy-web/bun-builder": minor
---

## Features

Add `suppressWarnings` option to `ApiModelOptions` for granular API Extractor warning suppression. Rules can match by `messageId`, text `pattern` (RegExp or substring), or both (AND logic). Suppressed messages are logged at info level instead of warning level.
