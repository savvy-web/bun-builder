import { BunLibraryBuilder } from "./src/index.js";

// Self-build using BunLibraryBuilder
export default BunLibraryBuilder.create({
	// External dependencies that should not be bundled
	externals: [
		// Build tools that consumers must install
		"@microsoft/api-extractor",
		"@typescript/native-preview",
		"typescript",
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
