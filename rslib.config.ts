import { NodeLibraryBuilder } from "./src/index.js";

// Use our own builder - self-building example
export default NodeLibraryBuilder.create({
	// Generate API model for npm target (used by documentation tooling)
	// Set RSLIB_BUILDER_LOCAL_PATH env var for local API model path resolution
	apiModel: {
		enabled: true,
		localPaths: process.env.RSLIB_BUILDER_LOCAL_PATH ? [process.env.RSLIB_BUILDER_LOCAL_PATH] : undefined,
	},
	// Externalize build tools (peerDependencies) and internal cross-module imports
	// source-map-support is optionally required by TypeScript internals (in try/catch)
	externals: [
		"@rslib/core",
		"@rsbuild/core",
		"@rspack/core",
		"typescript",
		"@microsoft/api-extractor",
		"source-map-support",
		// TSDoc lint plugin dependencies (optional)
		"eslint",
		"@typescript-eslint/parser",
		"eslint-plugin-tsdoc",
	],
	dtsBundledPackages: [],
	copyPatterns: [
		{
			from: "./**/*.json",
			context: "./src/public",
		},
	],
	transform({ pkg }) {
		delete pkg.devDependencies;
		delete pkg.bundleDependencies;
		delete pkg.scripts;
		delete pkg.publishConfig;
		delete pkg.devEngines;
		return pkg;
	},
});
