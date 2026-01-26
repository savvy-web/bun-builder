import { join } from "node:path";
import type ts from "typescript";
import { describe, expect, it } from "vitest";
import { ImportGraph } from "./import-graph.js";

/**
 * Creates a mock TypeScript system for testing.
 */
function createMockSys(files: Record<string, string>): ts.System {
	const normalizedFiles: Record<string, string> = {};

	// Normalize all paths to use forward slashes
	for (const [path, content] of Object.entries(files)) {
		normalizedFiles[path.replace(/\\/g, "/")] = content;
	}

	return {
		args: [],
		newLine: "\n",
		useCaseSensitiveFileNames: false,
		write: () => {},
		writeOutputIsTTY: () => false,
		readFile: (path: string) => normalizedFiles[path.replace(/\\/g, "/")],
		writeFile: () => {},
		resolvePath: (path: string) => path,
		fileExists: (path: string) => path.replace(/\\/g, "/") in normalizedFiles,
		directoryExists: (path: string) => {
			const normalized = path.replace(/\\/g, "/");
			return Object.keys(normalizedFiles).some((f) => f.startsWith(normalized));
		},
		createDirectory: () => {},
		getExecutingFilePath: () => "/",
		getCurrentDirectory: () => "/project",
		getDirectories: () => [],
		readDirectory: (
			path: string,
			extensions?: readonly string[],
			_excludes?: readonly string[],
			_includes?: readonly string[],
			_depth?: number,
		): string[] => {
			// Return files matching the path prefix
			const normalized = path.replace(/\\/g, "/");
			const matchingFiles = Object.keys(normalizedFiles).filter((f) => {
				if (!f.startsWith(normalized)) return false;
				if (extensions) {
					return extensions.some((ext) => f.endsWith(ext));
				}
				return true;
			});
			return matchingFiles;
		},
		exit: () => {},
	};
}

describe("ImportGraph", () => {
	describe("constructor", () => {
		it("should create an instance with required options", () => {
			const graph = new ImportGraph({ rootDir: "/project" });
			expect(graph).toBeInstanceOf(ImportGraph);
		});

		it("should accept custom tsconfig path", () => {
			const graph = new ImportGraph({
				rootDir: "/project",
				tsconfigPath: "./custom-tsconfig.json",
			});
			expect(graph).toBeInstanceOf(ImportGraph);
		});
	});

	describe("traceFromEntries", () => {
		it("should trace imports from a single entry point", () => {
			const mockSys = createMockSys({
				"/project/tsconfig.json": JSON.stringify({
					compilerOptions: {
						module: "ESNext",
						moduleResolution: "bundler",
						target: "ES2022",
					},
				}),
				"/project/src/index.ts": `
					import { foo } from "./utils.js";
					export { foo };
				`,
				"/project/src/utils.ts": `
					export const foo = 42;
				`,
			});

			const graph = new ImportGraph({
				rootDir: "/project",
				sys: mockSys,
			});

			const result = graph.traceFromEntries(["./src/index.ts"]);

			expect(result.errors).toEqual([]);
			expect(result.entries).toEqual(["/project/src/index.ts"]);
			expect(result.files).toContain("/project/src/index.ts");
			expect(result.files).toContain("/project/src/utils.ts");
		});

		it("should trace imports from multiple entry points", () => {
			const mockSys = createMockSys({
				"/project/tsconfig.json": JSON.stringify({
					compilerOptions: {
						module: "ESNext",
						moduleResolution: "bundler",
					},
				}),
				"/project/src/index.ts": `
					import { helper } from "./shared.js";
					export { helper };
				`,
				"/project/src/cli.ts": `
					import { helper } from "./shared.js";
					import { runCli } from "./cli-utils.js";
					export { runCli };
				`,
				"/project/src/shared.ts": `
					export const helper = () => {};
				`,
				"/project/src/cli-utils.ts": `
					export const runCli = () => {};
				`,
			});

			const graph = new ImportGraph({
				rootDir: "/project",
				sys: mockSys,
			});

			const result = graph.traceFromEntries(["./src/index.ts", "./src/cli.ts"]);

			expect(result.errors).toEqual([]);
			expect(result.entries).toHaveLength(2);
			expect(result.files).toContain("/project/src/index.ts");
			expect(result.files).toContain("/project/src/cli.ts");
			expect(result.files).toContain("/project/src/shared.ts");
			expect(result.files).toContain("/project/src/cli-utils.ts");
		});

		it("should handle circular imports without infinite loop", () => {
			const mockSys = createMockSys({
				"/project/tsconfig.json": JSON.stringify({
					compilerOptions: {
						module: "ESNext",
						moduleResolution: "bundler",
					},
				}),
				"/project/src/a.ts": `
					import { b } from "./b.js";
					export const a = () => b();
				`,
				"/project/src/b.ts": `
					import { a } from "./a.js";
					export const b = () => a();
				`,
			});

			const graph = new ImportGraph({
				rootDir: "/project",
				sys: mockSys,
			});

			const result = graph.traceFromEntries(["./src/a.ts"]);

			expect(result.errors).toEqual([]);
			expect(result.files).toContain("/project/src/a.ts");
			expect(result.files).toContain("/project/src/b.ts");
			// Should have exactly 2 files (no duplicates from circular refs)
			expect(result.files).toHaveLength(2);
		});

		it("should handle deep import chains", () => {
			const mockSys = createMockSys({
				"/project/tsconfig.json": JSON.stringify({
					compilerOptions: {
						module: "ESNext",
						moduleResolution: "bundler",
					},
				}),
				"/project/src/index.ts": `import { a } from "./level1.js";`,
				"/project/src/level1.ts": `import { b } from "./level2.js"; export const a = b;`,
				"/project/src/level2.ts": `import { c } from "./level3.js"; export const b = c;`,
				"/project/src/level3.ts": `export const c = 42;`,
			});

			const graph = new ImportGraph({
				rootDir: "/project",
				sys: mockSys,
			});

			const result = graph.traceFromEntries(["./src/index.ts"]);

			expect(result.errors).toEqual([]);
			expect(result.files).toHaveLength(4);
			expect(result.files).toContain("/project/src/level3.ts");
		});

		it("should handle re-exports (export * from)", () => {
			const mockSys = createMockSys({
				"/project/tsconfig.json": JSON.stringify({
					compilerOptions: {
						module: "ESNext",
						moduleResolution: "bundler",
					},
				}),
				"/project/src/index.ts": `
					export * from "./utils.js";
					export * from "./helpers.js";
				`,
				"/project/src/utils.ts": `
					export const util1 = 1;
					export const util2 = 2;
				`,
				"/project/src/helpers.ts": `
					export function help() {}
				`,
			});

			const graph = new ImportGraph({
				rootDir: "/project",
				sys: mockSys,
			});

			const result = graph.traceFromEntries(["./src/index.ts"]);

			expect(result.errors).toEqual([]);
			expect(result.files).toContain("/project/src/utils.ts");
			expect(result.files).toContain("/project/src/helpers.ts");
		});

		it("should handle named re-exports (export { x } from)", () => {
			const mockSys = createMockSys({
				"/project/tsconfig.json": JSON.stringify({
					compilerOptions: {
						module: "ESNext",
						moduleResolution: "bundler",
					},
				}),
				"/project/src/index.ts": `
					export { foo, bar } from "./internals.js";
				`,
				"/project/src/internals.ts": `
					export const foo = 1;
					export const bar = 2;
					export const baz = 3; // not exported from index
				`,
			});

			const graph = new ImportGraph({
				rootDir: "/project",
				sys: mockSys,
			});

			const result = graph.traceFromEntries(["./src/index.ts"]);

			expect(result.errors).toEqual([]);
			expect(result.files).toContain("/project/src/internals.ts");
		});

		it("should skip external node_modules imports", () => {
			const mockSys = createMockSys({
				"/project/tsconfig.json": JSON.stringify({
					compilerOptions: {
						module: "ESNext",
						moduleResolution: "bundler",
					},
				}),
				"/project/src/index.ts": `
					import { something } from "external-package";
					import { local } from "./local.js";
					export { local };
				`,
				"/project/src/local.ts": `
					export const local = 42;
				`,
			});

			const graph = new ImportGraph({
				rootDir: "/project",
				sys: mockSys,
			});

			const result = graph.traceFromEntries(["./src/index.ts"]);

			expect(result.errors).toEqual([]);
			// Should only include local files
			expect(result.files).toContain("/project/src/index.ts");
			expect(result.files).toContain("/project/src/local.ts");
			expect(result.files).toHaveLength(2);
		});

		it("should filter out test files", () => {
			const mockSys = createMockSys({
				"/project/tsconfig.json": JSON.stringify({
					compilerOptions: {
						module: "ESNext",
						moduleResolution: "bundler",
					},
				}),
				"/project/src/index.ts": `
					import { helper } from "./helper.js";
					export { helper };
				`,
				"/project/src/helper.ts": `
					export const helper = () => {};
				`,
				"/project/src/helper.test.ts": `
					import { helper } from "./helper.js";
					test("helper works", () => {});
				`,
			});

			const graph = new ImportGraph({
				rootDir: "/project",
				sys: mockSys,
			});

			const result = graph.traceFromEntries(["./src/index.ts"]);

			expect(result.errors).toEqual([]);
			expect(result.files).not.toContain("/project/src/helper.test.ts");
		});

		it("should filter out __test__ directories", () => {
			const mockSys = createMockSys({
				"/project/tsconfig.json": JSON.stringify({
					compilerOptions: {
						module: "ESNext",
						moduleResolution: "bundler",
					},
				}),
				"/project/src/index.ts": `
					import { util } from "./utils/index.js";
					export { util };
				`,
				"/project/src/utils/index.ts": `
					export const util = 42;
				`,
				"/project/src/__test__/fixtures.ts": `
					export const fixture = {};
				`,
			});

			const graph = new ImportGraph({
				rootDir: "/project",
				sys: mockSys,
			});

			const result = graph.traceFromEntries(["./src/index.ts"]);

			expect(result.files).not.toContain("/project/src/__test__/fixtures.ts");
		});

		it("should filter out __tests__ directories from results even when imported", () => {
			const mockSys = createMockSys({
				"/project/tsconfig.json": JSON.stringify({
					compilerOptions: {
						module: "ESNext",
						moduleResolution: "bundler",
					},
				}),
				"/project/src/index.ts": `
					import { util } from "./utils/index.js";
					// This import is intentional - testing that __tests__ files are filtered from results
					import { testUtil } from "./__tests__/test-utils.js";
					export { util };
				`,
				"/project/src/utils/index.ts": `
					export const util = 42;
				`,
				"/project/src/__tests__/test-utils.ts": `
					export const testUtil = {};
				`,
			});

			const graph = new ImportGraph({
				rootDir: "/project",
				sys: mockSys,
			});

			const result = graph.traceFromEntries(["./src/index.ts"]);

			// Even though __tests__ file was imported, it should be filtered from results
			expect(result.files).not.toContain("/project/src/__tests__/test-utils.ts");
			expect(result.files).toContain("/project/src/index.ts");
			expect(result.files).toContain("/project/src/utils/index.ts");
		});

		it("should filter out .spec.ts files from results even when imported", () => {
			const mockSys = createMockSys({
				"/project/tsconfig.json": JSON.stringify({
					compilerOptions: {
						module: "ESNext",
						moduleResolution: "bundler",
					},
				}),
				"/project/src/index.ts": `
					import { helper } from "./helper.js";
					// This import is intentional - testing that .spec files are filtered from results
					import { specData } from "./helper.spec.js";
					export { helper };
				`,
				"/project/src/helper.ts": `
					export const helper = () => {};
				`,
				"/project/src/helper.spec.ts": `
					export const specData = "test";
				`,
			});

			const graph = new ImportGraph({
				rootDir: "/project",
				sys: mockSys,
			});

			const result = graph.traceFromEntries(["./src/index.ts"]);

			expect(result.errors).toEqual([]);
			// Even though .spec file was imported, it should be filtered from results
			expect(result.files).not.toContain("/project/src/helper.spec.ts");
			expect(result.files).toContain("/project/src/index.ts");
			expect(result.files).toContain("/project/src/helper.ts");
		});

		it("should exclude files matching custom excludePatterns", () => {
			const mockSys = createMockSys({
				"/project/tsconfig.json": JSON.stringify({
					compilerOptions: {
						module: "ESNext",
						moduleResolution: "bundler",
					},
				}),
				"/project/src/index.ts": `
					import { storyData } from "./button.stories.js";
					import { mockData } from "./mocks/api.js";
					import { util } from "./utils.js";
					export { util };
				`,
				"/project/src/button.stories.ts": `
					export const storyData = { title: "Button" };
				`,
				"/project/src/mocks/api.ts": `
					export const mockData = { id: 1 };
				`,
				"/project/src/utils.ts": `
					export const util = () => {};
				`,
			});

			const graph = new ImportGraph({
				rootDir: "/project",
				sys: mockSys,
				excludePatterns: [".stories.", "/mocks/"],
			});

			const result = graph.traceFromEntries(["./src/index.ts"]);

			expect(result.errors).toEqual([]);
			// Custom patterns should be excluded
			expect(result.files).not.toContain("/project/src/button.stories.ts");
			expect(result.files).not.toContain("/project/src/mocks/api.ts");
			// Regular files should be included
			expect(result.files).toContain("/project/src/index.ts");
			expect(result.files).toContain("/project/src/utils.ts");
		});

		it("should handle missing entry file with error", () => {
			const mockSys = createMockSys({
				"/project/tsconfig.json": JSON.stringify({
					compilerOptions: {
						module: "ESNext",
						moduleResolution: "bundler",
					},
				}),
				// Need at least one .ts file so tsconfig parsing succeeds
				"/project/src/exists.ts": `export const x = 1;`,
			});

			const graph = new ImportGraph({
				rootDir: "/project",
				sys: mockSys,
			});

			const result = graph.traceFromEntries(["./src/nonexistent.ts"]);

			expect(result.errors).toHaveLength(1);
			expect(result.errors[0].type).toBe("entry_not_found");
			expect(result.errors[0].message).toContain("Entry file not found");
			expect(result.files).toEqual([]);
		});

		it("should return error when tsconfig.json is missing", () => {
			const mockSys = createMockSys({
				"/project/src/index.ts": `export const x = 1;`,
			});

			const graph = new ImportGraph({
				rootDir: "/project",
				sys: mockSys,
			});

			const result = graph.traceFromEntries(["./src/index.ts"]);

			expect(result.errors).toHaveLength(1);
			expect(result.errors[0].type).toBe("tsconfig_not_found");
			expect(result.errors[0].message).toContain("No tsconfig.json found");
		});

		it("should handle absolute entry paths", () => {
			const mockSys = createMockSys({
				"/project/tsconfig.json": JSON.stringify({
					compilerOptions: {
						module: "ESNext",
						moduleResolution: "bundler",
					},
				}),
				"/project/src/index.ts": `export const x = 1;`,
			});

			const graph = new ImportGraph({
				rootDir: "/project",
				sys: mockSys,
			});

			const result = graph.traceFromEntries(["/project/src/index.ts"]);

			expect(result.errors).toEqual([]);
			expect(result.files).toContain("/project/src/index.ts");
		});

		it("should handle index.ts barrel files", () => {
			const mockSys = createMockSys({
				"/project/tsconfig.json": JSON.stringify({
					compilerOptions: {
						module: "ESNext",
						moduleResolution: "bundler",
					},
				}),
				"/project/src/index.ts": `
					export * from "./utils/index.js";
				`,
				"/project/src/utils/index.ts": `
					export * from "./string.js";
					export * from "./number.js";
				`,
				"/project/src/utils/string.ts": `
					export const formatString = (s: string) => s;
				`,
				"/project/src/utils/number.ts": `
					export const formatNumber = (n: number) => n;
				`,
			});

			const graph = new ImportGraph({
				rootDir: "/project",
				sys: mockSys,
			});

			const result = graph.traceFromEntries(["./src/index.ts"]);

			expect(result.errors).toEqual([]);
			expect(result.files).toContain("/project/src/utils/string.ts");
			expect(result.files).toContain("/project/src/utils/number.ts");
		});

		it("should return sorted file list", () => {
			const mockSys = createMockSys({
				"/project/tsconfig.json": JSON.stringify({
					compilerOptions: {
						module: "ESNext",
						moduleResolution: "bundler",
					},
				}),
				"/project/src/index.ts": `
					import "./z.js";
					import "./a.js";
					import "./m.js";
				`,
				"/project/src/z.ts": `export const z = 1;`,
				"/project/src/a.ts": `export const a = 1;`,
				"/project/src/m.ts": `export const m = 1;`,
			});

			const graph = new ImportGraph({
				rootDir: "/project",
				sys: mockSys,
			});

			const result = graph.traceFromEntries(["./src/index.ts"]);

			expect(result.files).toEqual([
				"/project/src/a.ts",
				"/project/src/index.ts",
				"/project/src/m.ts",
				"/project/src/z.ts",
			]);
		});
	});

	describe("traceFromPackageExports", () => {
		it("should trace from package.json exports", () => {
			const mockSys = createMockSys({
				"/project/tsconfig.json": JSON.stringify({
					compilerOptions: {
						module: "ESNext",
						moduleResolution: "bundler",
					},
				}),
				"/project/package.json": JSON.stringify({
					name: "test-package",
					version: "1.0.0",
					exports: {
						".": "./src/index.ts",
						"./utils": "./src/utils.ts",
					},
				}),
				"/project/src/index.ts": `
					import { internal } from "./internal.js";
					export { internal };
				`,
				"/project/src/utils.ts": `
					export const util = 42;
				`,
				"/project/src/internal.ts": `
					export const internal = "internal";
				`,
			});

			const graph = new ImportGraph({
				rootDir: "/project",
				sys: mockSys,
			});

			const result = graph.traceFromPackageExports("./package.json");

			expect(result.errors).toEqual([]);
			expect(result.entries).toContain("/project/src/index.ts");
			expect(result.entries).toContain("/project/src/utils.ts");
			expect(result.files).toContain("/project/src/index.ts");
			expect(result.files).toContain("/project/src/utils.ts");
			expect(result.files).toContain("/project/src/internal.ts");
		});

		it("should trace from conditional exports", () => {
			const mockSys = createMockSys({
				"/project/tsconfig.json": JSON.stringify({
					compilerOptions: {
						module: "ESNext",
						moduleResolution: "bundler",
					},
				}),
				"/project/package.json": JSON.stringify({
					name: "test-package",
					version: "1.0.0",
					exports: {
						".": {
							import: "./src/index.ts",
							require: "./dist/index.js",
						},
					},
				}),
				"/project/src/index.ts": `
					export const main = 1;
				`,
			});

			const graph = new ImportGraph({
				rootDir: "/project",
				sys: mockSys,
			});

			const result = graph.traceFromPackageExports("./package.json");

			expect(result.errors).toEqual([]);
			expect(result.files).toContain("/project/src/index.ts");
		});

		it("should trace from bin entries", () => {
			const mockSys = createMockSys({
				"/project/tsconfig.json": JSON.stringify({
					compilerOptions: {
						module: "ESNext",
						moduleResolution: "bundler",
					},
				}),
				"/project/package.json": JSON.stringify({
					name: "test-package",
					version: "1.0.0",
					exports: "./src/index.ts",
					bin: {
						"my-cli": "./src/cli.ts",
					},
				}),
				"/project/src/index.ts": `export const lib = 1;`,
				"/project/src/cli.ts": `
					import { lib } from "./index.js";
					console.log(lib);
				`,
			});

			const graph = new ImportGraph({
				rootDir: "/project",
				sys: mockSys,
			});

			const result = graph.traceFromPackageExports("./package.json");

			expect(result.errors).toEqual([]);
			expect(result.files).toContain("/project/src/index.ts");
			expect(result.files).toContain("/project/src/cli.ts");
		});

		it("should return error for invalid package.json", () => {
			const mockSys = createMockSys({
				"/project/tsconfig.json": JSON.stringify({
					compilerOptions: {},
				}),
				"/project/package.json": "{ invalid json",
			});

			const graph = new ImportGraph({
				rootDir: "/project",
				sys: mockSys,
			});

			const result = graph.traceFromPackageExports("./package.json");

			expect(result.errors).toHaveLength(1);
			expect(result.errors[0].type).toBe("package_json_parse_error");
			expect(result.errors[0].message).toContain("Failed to parse package.json");
		});

		it("should return error for missing package.json", () => {
			const mockSys = createMockSys({
				"/project/tsconfig.json": JSON.stringify({
					compilerOptions: {},
				}),
			});

			const graph = new ImportGraph({
				rootDir: "/project",
				sys: mockSys,
			});

			const result = graph.traceFromPackageExports("./package.json");

			expect(result.errors).toHaveLength(1);
			expect(result.errors[0].type).toBe("package_json_not_found");
			expect(result.errors[0].message).toContain("Failed to read package.json");
		});

		it("should handle package.json with no exports", () => {
			const mockSys = createMockSys({
				"/project/tsconfig.json": JSON.stringify({
					compilerOptions: {
						module: "ESNext",
						moduleResolution: "bundler",
					},
				}),
				"/project/package.json": JSON.stringify({
					name: "test-package",
					version: "1.0.0",
					// No exports field
				}),
			});

			const graph = new ImportGraph({
				rootDir: "/project",
				sys: mockSys,
			});

			const result = graph.traceFromPackageExports("./package.json");

			// No entries means no files traced
			expect(result.files).toEqual([]);
			expect(result.entries).toEqual([]);
		});

		it("should handle dist path mapping in exports", () => {
			const mockSys = createMockSys({
				"/project/tsconfig.json": JSON.stringify({
					compilerOptions: {
						module: "ESNext",
						moduleResolution: "bundler",
					},
				}),
				"/project/package.json": JSON.stringify({
					name: "test-package",
					version: "1.0.0",
					exports: {
						".": "./dist/index.js", // dist path should map to src
					},
				}),
				"/project/src/index.ts": `export const main = 1;`,
			});

			const graph = new ImportGraph({
				rootDir: "/project",
				sys: mockSys,
			});

			const result = graph.traceFromPackageExports("./package.json");

			expect(result.entries).toContain("/project/src/index.ts");
			expect(result.files).toContain("/project/src/index.ts");
		});
	});

	describe("path alias resolution", () => {
		it("should resolve path aliases from tsconfig", () => {
			const mockSys = createMockSys({
				"/project/tsconfig.json": JSON.stringify({
					compilerOptions: {
						module: "ESNext",
						moduleResolution: "bundler",
						baseUrl: ".",
						paths: {
							"@/*": ["./src/*"],
						},
					},
				}),
				"/project/src/index.ts": `
					import { helper } from "@/utils/helper.js";
					export { helper };
				`,
				"/project/src/utils/helper.ts": `
					export const helper = () => {};
				`,
			});

			const graph = new ImportGraph({
				rootDir: "/project",
				sys: mockSys,
			});

			const result = graph.traceFromEntries(["./src/index.ts"]);

			expect(result.errors).toEqual([]);
			expect(result.files).toContain("/project/src/utils/helper.ts");
		});
	});
});

describe("ImportGraph.fromEntries (static method)", () => {
	it("should trace imports from entries", () => {
		const mockSys = createMockSys({
			"/project/tsconfig.json": JSON.stringify({
				compilerOptions: {
					module: "ESNext",
					moduleResolution: "bundler",
				},
			}),
			"/project/src/index.ts": `export const x = 1;`,
		});

		const result = ImportGraph.fromEntries(["./src/index.ts"], {
			rootDir: "/project",
			sys: mockSys,
		});

		expect(result.files).toContain("/project/src/index.ts");
	});
});

describe("ImportGraph.fromPackageExports (static method)", () => {
	it("should trace imports from package exports", () => {
		const mockSys = createMockSys({
			"/project/tsconfig.json": JSON.stringify({
				compilerOptions: {
					module: "ESNext",
					moduleResolution: "bundler",
				},
			}),
			"/project/package.json": JSON.stringify({
				name: "test",
				version: "1.0.0",
				exports: "./src/index.ts",
			}),
			"/project/src/index.ts": `export const x = 1;`,
		});

		const result = ImportGraph.fromPackageExports("./package.json", {
			rootDir: "/project",
			sys: mockSys,
		});

		expect(result.files).toContain("/project/src/index.ts");
	});
});

describe("edge cases", () => {
	it("should filter out .d.ts files from results", () => {
		const mockSys = createMockSys({
			"/project/tsconfig.json": JSON.stringify({
				compilerOptions: {
					module: "ESNext",
					moduleResolution: "bundler",
				},
			}),
			"/project/src/index.ts": `
				export const x = 1;
			`,
			"/project/src/types.d.ts": `
				export type Foo = string;
			`,
		});

		const graph = new ImportGraph({
			rootDir: "/project",
			sys: mockSys,
		});

		const result = graph.traceFromEntries(["./src/index.ts"]);

		expect(result.files).toContain("/project/src/index.ts");
		// .d.ts files should be filtered from results
		expect(result.files).not.toContain("/project/src/types.d.ts");
	});

	it("should include .tsx files in results", () => {
		const mockSys = createMockSys({
			"/project/tsconfig.json": JSON.stringify({
				compilerOptions: {
					module: "ESNext",
					moduleResolution: "bundler",
					jsx: "react-jsx",
				},
			}),
			"/project/src/index.ts": `
				import { Component } from "./component.js";
				export { Component };
			`,
			"/project/src/component.tsx": `
				export const Component = () => <div>Hello</div>;
			`,
		});

		const graph = new ImportGraph({
			rootDir: "/project",
			sys: mockSys,
		});

		const result = graph.traceFromEntries(["./src/index.ts"]);

		expect(result.files).toContain("/project/src/component.tsx");
	});

	it("should handle dynamic imports", () => {
		const mockSys = createMockSys({
			"/project/tsconfig.json": JSON.stringify({
				compilerOptions: {
					module: "ESNext",
					moduleResolution: "bundler",
				},
			}),
			"/project/src/index.ts": `
				export async function load() {
					const mod = await import("./lazy.js");
					return mod;
				}
			`,
			"/project/src/lazy.ts": `
				export const lazyValue = 42;
			`,
		});

		const graph = new ImportGraph({
			rootDir: "/project",
			sys: mockSys,
		});

		const result = graph.traceFromEntries(["./src/index.ts"]);

		expect(result.files).toContain("/project/src/lazy.ts");
	});

	it("should handle failed file reads gracefully", () => {
		const mockSys = createMockSys({
			"/project/tsconfig.json": JSON.stringify({
				compilerOptions: {
					module: "ESNext",
					moduleResolution: "bundler",
				},
			}),
			"/project/src/index.ts": `export const x = 1;`,
		});

		// Override readFile to return undefined for a specific file
		const originalReadFile = mockSys.readFile;
		mockSys.readFile = (path: string): string | undefined => {
			if (path.includes("index.ts")) {
				return undefined; // Simulate read failure
			}
			return originalReadFile(path);
		};

		const graph = new ImportGraph({
			rootDir: "/project",
			sys: mockSys,
		});

		const result = graph.traceFromEntries(["./src/index.ts"]);

		// Should have an error about failed read
		expect(result.errors.some((e) => e.type === "file_read_error")).toBe(true);
		expect(result.errors.some((e) => e.message.includes("Failed to read file"))).toBe(true);
	});

	it("should return error for invalid custom tsconfig path", () => {
		const mockSys = createMockSys({
			"/project/src/index.ts": `export const x = 1;`,
		});

		const graph = new ImportGraph({
			rootDir: "/project",
			tsconfigPath: "./nonexistent.json",
			sys: mockSys,
		});

		const result = graph.traceFromEntries(["./src/index.ts"]);

		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors[0].type).toBe("tsconfig_not_found");
		expect(result.errors[0].message).toContain("No tsconfig.json found");
	});
});

describe("integration: self-test on rslib-builder", () => {
	it("should trace imports from rslib-builder package.json", () => {
		// Use the actual filesystem for this test
		const rootDir = join(__dirname, "../../../..");

		const graph = new ImportGraph({ rootDir });
		const result = graph.traceFromPackageExports("./package.json");

		// Should find the main entry point
		expect(result.entries.length).toBeGreaterThan(0);

		// Should find source files (not test files)
		expect(result.files.length).toBeGreaterThan(0);

		// All files should be .ts files
		for (const file of result.files) {
			expect(file).toMatch(/\.tsx?$/);
		}

		// No test files should be included
		for (const file of result.files) {
			expect(file).not.toMatch(/\.test\.ts$/);
			expect(file).not.toMatch(/\.spec\.ts$/);
			expect(file).not.toContain("/__test__/");
		}

		// Should include expected files
		const fileNames = result.files.map((f) => f.split("/").pop());
		expect(fileNames).toContain("index.ts");
	});
});
