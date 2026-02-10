/**
 * Unit tests for the EntryExtractor class.
 */

import { describe, expect, test } from "bun:test";
import type { PackageJson } from "../../types/package-json.js";
import { EntryExtractor } from "./entry-extractor.js";

describe("EntryExtractor", () => {
	describe("extract() with exports field", () => {
		test("extracts string export at root", () => {
			const extractor = new EntryExtractor();
			const pkg: PackageJson = {
				exports: "./src/index.ts",
			};

			const result = extractor.extract(pkg);

			expect(result.entries).toEqual({
				index: "./src/index.ts",
			});
			expect(result.exportPaths).toEqual({
				index: ".",
			});
		});

		test("extracts object exports with subpaths", () => {
			const extractor = new EntryExtractor();
			const pkg: PackageJson = {
				exports: {
					".": "./src/index.ts",
					"./utils": "./src/utils.ts",
				},
			};

			const result = extractor.extract(pkg);

			expect(result.entries).toEqual({
				index: "./src/index.ts",
				utils: "./src/utils.ts",
			});
			expect(result.exportPaths).toEqual({
				index: ".",
				utils: "./utils",
			});
		});

		test("extracts conditional exports with import condition", () => {
			const extractor = new EntryExtractor();
			const pkg: PackageJson = {
				exports: {
					".": {
						import: "./src/index.ts",
						types: "./src/index.d.ts",
					},
				},
			};

			const result = extractor.extract(pkg);

			expect(result.entries).toEqual({
				index: "./src/index.ts",
			});
			expect(result.exportPaths).toEqual({
				index: ".",
			});
		});

		test("extracts conditional exports with default condition", () => {
			const extractor = new EntryExtractor();
			const pkg: PackageJson = {
				exports: {
					".": {
						default: "./src/index.ts",
					},
				},
			};

			const result = extractor.extract(pkg);

			expect(result.entries).toEqual({
				index: "./src/index.ts",
			});
			expect(result.exportPaths).toEqual({
				index: ".",
			});
		});

		test("skips package.json export", () => {
			const extractor = new EntryExtractor();
			const pkg: PackageJson = {
				exports: {
					".": "./src/index.ts",
					"./package.json": "./package.json",
				},
			};

			const result = extractor.extract(pkg);

			expect(result.entries).toEqual({
				index: "./src/index.ts",
			});
			expect(result.exportPaths).toEqual({
				index: ".",
			});
		});

		test("skips JSON exports", () => {
			const extractor = new EntryExtractor();
			const pkg: PackageJson = {
				exports: {
					".": "./src/index.ts",
					"./config.json": "./config.json",
				},
			};

			const result = extractor.extract(pkg);

			expect(result.entries).toEqual({
				index: "./src/index.ts",
			});
			expect(result.exportPaths).toEqual({
				index: ".",
			});
		});

		test("resolves dist paths to src paths", () => {
			const extractor = new EntryExtractor();
			const pkg: PackageJson = {
				exports: {
					".": "./dist/index.js",
				},
			};

			const result = extractor.extract(pkg);

			expect(result.entries).toEqual({
				index: "./src/index.ts",
			});
			expect(result.exportPaths).toEqual({
				index: ".",
			});
		});

		test("handles nested subpath exports", () => {
			const extractor = new EntryExtractor();
			const pkg: PackageJson = {
				exports: {
					".": "./src/index.ts",
					"./components/button": "./src/components/button.ts",
				},
			};

			const result = extractor.extract(pkg);

			expect(result.entries).toEqual({
				index: "./src/index.ts",
				"components-button": "./src/components/button.ts",
			});
			expect(result.exportPaths).toEqual({
				index: ".",
				"components-button": "./components/button",
			});
		});

		test("handles tsx files", () => {
			const extractor = new EntryExtractor();
			const pkg: PackageJson = {
				exports: {
					".": "./src/index.tsx",
				},
			};

			const result = extractor.extract(pkg);

			expect(result.entries).toEqual({
				index: "./src/index.tsx",
			});
			expect(result.exportPaths).toEqual({
				index: ".",
			});
		});

		test("skips non-TypeScript files", () => {
			const extractor = new EntryExtractor();
			const pkg: PackageJson = {
				exports: {
					".": "./src/index.js",
				},
			};

			const result = extractor.extract(pkg);

			expect(result.entries).toEqual({});
			expect(result.exportPaths).toEqual({});
		});

		test("handles empty exports", () => {
			const extractor = new EntryExtractor();
			const pkg: PackageJson = {};

			const result = extractor.extract(pkg);

			expect(result.entries).toEqual({});
			expect(result.exportPaths).toEqual({});
		});
	});

	describe("extract() with bin field", () => {
		test("extracts string bin", () => {
			const extractor = new EntryExtractor();
			const pkg: PackageJson = {
				bin: "./src/cli.ts",
			};

			const result = extractor.extract(pkg);

			expect(result.entries).toEqual({
				"bin/cli": "./src/cli.ts",
			});
			// Bin entries do not populate exportPaths
			expect(result.exportPaths).toEqual({});
		});

		test("extracts object bin with single command", () => {
			const extractor = new EntryExtractor();
			const pkg: PackageJson = {
				bin: {
					"my-cli": "./src/bin/cli.ts",
				},
			};

			const result = extractor.extract(pkg);

			expect(result.entries).toEqual({
				"bin/my-cli": "./src/bin/cli.ts",
			});
			expect(result.exportPaths).toEqual({});
		});

		test("extracts object bin with multiple commands", () => {
			const extractor = new EntryExtractor();
			const pkg: PackageJson = {
				bin: {
					"cli-a": "./src/bin/a.ts",
					"cli-b": "./src/bin/b.ts",
				},
			};

			const result = extractor.extract(pkg);

			expect(result.entries).toEqual({
				"bin/cli-a": "./src/bin/a.ts",
				"bin/cli-b": "./src/bin/b.ts",
			});
			expect(result.exportPaths).toEqual({});
		});

		test("resolves dist bin paths to src", () => {
			const extractor = new EntryExtractor();
			const pkg: PackageJson = {
				bin: {
					"my-cli": "./dist/cli.js",
				},
			};

			const result = extractor.extract(pkg);

			expect(result.entries).toEqual({
				"bin/my-cli": "./src/cli.ts",
			});
			expect(result.exportPaths).toEqual({});
		});

		test("combines exports and bin", () => {
			const extractor = new EntryExtractor();
			const pkg: PackageJson = {
				exports: {
					".": "./src/index.ts",
				},
				bin: {
					"my-cli": "./src/cli.ts",
				},
			};

			const result = extractor.extract(pkg);

			expect(result.entries).toEqual({
				index: "./src/index.ts",
				"bin/my-cli": "./src/cli.ts",
			});
			// Only exports populate exportPaths, not bin
			expect(result.exportPaths).toEqual({
				index: ".",
			});
		});
	});

	describe("exportsAsIndexes option", () => {
		test("creates index paths when enabled", () => {
			const extractor = new EntryExtractor({ exportsAsIndexes: true });
			const pkg: PackageJson = {
				exports: {
					".": "./src/index.ts",
					"./foo/bar": "./src/foo/bar.ts",
				},
			};

			const result = extractor.extract(pkg);

			expect(result.entries).toEqual({
				index: "./src/index.ts",
				"foo/bar/index": "./src/foo/bar.ts",
			});
			expect(result.exportPaths).toEqual({
				index: ".",
				"foo/bar/index": "./foo/bar",
			});
		});

		test("creates flat paths when disabled", () => {
			const extractor = new EntryExtractor({ exportsAsIndexes: false });
			const pkg: PackageJson = {
				exports: {
					".": "./src/index.ts",
					"./foo/bar": "./src/foo/bar.ts",
				},
			};

			const result = extractor.extract(pkg);

			expect(result.entries).toEqual({
				index: "./src/index.ts",
				"foo-bar": "./src/foo/bar.ts",
			});
			expect(result.exportPaths).toEqual({
				index: ".",
				"foo-bar": "./foo/bar",
			});
		});
	});

	describe("exportPaths", () => {
		test("maps entry names back to original export keys", () => {
			const extractor = new EntryExtractor();
			const pkg: PackageJson = {
				exports: {
					".": "./src/index.ts",
					"./utils": "./src/utils.ts",
					"./nested/one": "./src/nested/one.ts",
				},
			};

			const result = extractor.extract(pkg);

			expect(result.exportPaths).toEqual({
				index: ".",
				utils: "./utils",
				"nested-one": "./nested/one",
			});
		});

		test("does not include bin entries", () => {
			const extractor = new EntryExtractor();
			const pkg: PackageJson = {
				exports: {
					".": "./src/index.ts",
				},
				bin: {
					"my-cli": "./src/cli.ts",
				},
			};

			const result = extractor.extract(pkg);

			expect(result.exportPaths).toEqual({
				index: ".",
			});
			expect(result.exportPaths["bin/my-cli"]).toBeUndefined();
		});
	});
});

describe("EntryExtractor.fromPackageJson", () => {
	test("static method works correctly", () => {
		const pkg: PackageJson = {
			exports: {
				".": "./src/index.ts",
			},
		};

		const result = EntryExtractor.fromPackageJson(pkg);

		expect(result.entries).toEqual({
			index: "./src/index.ts",
		});
		expect(result.exportPaths).toEqual({
			index: ".",
		});
	});

	test("passes options to extractor", () => {
		const pkg: PackageJson = {
			exports: {
				"./foo/bar": "./src/foo/bar.ts",
			},
		};

		const result = EntryExtractor.fromPackageJson(pkg, { exportsAsIndexes: true });

		expect(result.entries).toEqual({
			"foo/bar/index": "./src/foo/bar.ts",
		});
		expect(result.exportPaths).toEqual({
			"foo/bar/index": "./foo/bar",
		});
	});
});
