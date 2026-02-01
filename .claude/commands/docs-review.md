# Documentation Review

Launch a docs-gen-agent to review and update user-facing documentation.

## Files to Review

- `docs/` - Level 2 repository documentation
- `README.md` - NPM landing page
- `CONTRIBUTING.md` - Developer setup guide
- `package.json` - Package metadata

## Tasks (in priority order)

1. **README.md**: Verify it explains what the package does, the problem it salves, installation, and quickstart. Deep configuration should link to `docs/`.

2. **docs/**: Ensure API documentation matches current design docs.

3. **CONTRIBUTING.md**: Verify local development setup is accurate (commands, prerequisites).

4. **package.json**: Check `repository`, `bugs`, `homepage`, and `keywords` fields are set.

## Constraints

- Do not add features or refactor code
- Focus on accuracy against current implementation
- Keep README concise; defer details to docs/
