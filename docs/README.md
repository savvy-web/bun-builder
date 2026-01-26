# Documentation

Comprehensive documentation for `@savvy-web/rslib-builder`.

## Quick Links

- [Getting Started](./guides/getting-started.md) - Installation and first build
- [Architecture Overview](./architecture/overview.md) - How the build system works
- [Plugin System](./guides/plugins.md) - Built-in plugins and custom extensions
- [Configuration](./guides/configuration.md) - All configuration options
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions

## What is rslib-builder?

rslib-builder is a build system abstraction layer built on
[RSlib](https://rslib.dev/)/[Rsbuild](https://rsbuild.dev/)/[Rspack](https://rspack.dev/)
that simplifies building TypeScript packages for npm distribution.

### Key Capabilities

| Capability | Description |
| :--------- | :---------- |
| Auto Entry Detection | Extracts entry points from package.json exports |
| Type Generation | Uses tsgo for fast TypeScript declaration generation |
| Declaration Bundling | Bundles .d.ts files with API Extractor |
| API Model Generation | Creates machine-readable API docs for tooling |
| TSDoc Validation | Optional pre-build TSDoc comment validation |
| Package Transform | Resolves PNPM references, updates export paths |
| Multi-Target | Separate dev (debugging) and npm (production) builds |

### How It Compares

| Feature | rslib-builder | Plain RSlib | tsc + rollup |
| :------ | :-----------: | :---------: | :----------: |
| Zero config | Yes | Partial | No |
| Type bundling | Built-in | Manual | Manual |
| PNPM catalog support | Automatic | No | No |
| Package.json transform | Automatic | Manual | Manual |
| Build targets | Built-in | Manual | Manual |

## Documentation Structure

```text
docs/
├── README.md                 # This file
├── architecture/
│   └── overview.md          # System architecture
├── guides/
│   ├── getting-started.md   # Quick start guide
│   ├── configuration.md     # Configuration reference
│   └── plugins.md           # Plugin system
└── troubleshooting.md       # Common issues
```

## Related Resources

- [RSlib Documentation](https://rslib.dev/)
- [Rsbuild Plugin API](https://rsbuild.dev/plugins/dev/core)
- [API Extractor](https://api-extractor.com/)
- [PNPM Catalogs](https://pnpm.io/catalogs)
