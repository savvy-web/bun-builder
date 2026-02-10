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

	// Configure API model and TSDoc linting
	apiModel: {
		tsdoc: {
			lint: {
				enabled: true,
				onError: "error",
			},
		},
	},
	transform({ pkg }) {
		delete pkg.devDependencies;
		delete pkg.bundleDependencies;
		delete pkg.scripts;
		delete pkg.publishConfig;
		delete pkg.devEngines;
		return pkg;
	},
});
