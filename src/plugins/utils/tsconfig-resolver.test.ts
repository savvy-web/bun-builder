import { describe, expect, it } from "bun:test";
import type { ParsedCommandLine } from "typescript";
import {
	ImportsNotUsedAsValues,
	JsxEmit,
	ModuleDetectionKind,
	ModuleKind,
	ModuleResolutionKind,
	NewLineKind,
	ScriptTarget,
} from "typescript";
import { TsconfigResolver, TsconfigResolverError } from "./tsconfig-resolver.js";

describe("TsconfigResolver", () => {
	describe("TsconfigResolverError", () => {
		it("should create error with message only", () => {
			const error = new TsconfigResolverError("Something went wrong");
			expect(error.message).toBe("Something went wrong");
			expect(error.name).toBe("TsconfigResolverError");
			expect(error.option).toBeUndefined();
			expect(error.value).toBeUndefined();
		});

		it("should create error with option and value", () => {
			const error = new TsconfigResolverError("Invalid option", "target", 999);
			expect(error.message).toBe("Invalid option");
			expect(error.option).toBe("target");
			expect(error.value).toBe(999);
		});

		it("should be instanceof Error", () => {
			const error = new TsconfigResolverError("Test error");
			expect(error).toBeInstanceOf(Error);
			expect(error).toBeInstanceOf(TsconfigResolverError);
		});
	});

	describe("static convertScriptTarget", () => {
		it("should convert ES2022 target", () => {
			expect(TsconfigResolver.convertScriptTarget(ScriptTarget.ES2022)).toBe("es2022");
		});

		it("should convert ESNext target", () => {
			expect(TsconfigResolver.convertScriptTarget(ScriptTarget.ESNext)).toBe("esnext");
		});

		it("should convert ES5 target", () => {
			expect(TsconfigResolver.convertScriptTarget(ScriptTarget.ES5)).toBe("es5");
		});

		it("should convert Latest target to esnext", () => {
			expect(TsconfigResolver.convertScriptTarget(ScriptTarget.Latest)).toBe("esnext");
		});

		it("should return undefined for undefined input", () => {
			expect(TsconfigResolver.convertScriptTarget(undefined)).toBeUndefined();
		});

		it("should handle all ES versions", () => {
			expect(TsconfigResolver.convertScriptTarget(ScriptTarget.ES2015)).toBe("es2015");
			expect(TsconfigResolver.convertScriptTarget(ScriptTarget.ES2016)).toBe("es2016");
			expect(TsconfigResolver.convertScriptTarget(ScriptTarget.ES2017)).toBe("es2017");
			expect(TsconfigResolver.convertScriptTarget(ScriptTarget.ES2018)).toBe("es2018");
			expect(TsconfigResolver.convertScriptTarget(ScriptTarget.ES2019)).toBe("es2019");
			expect(TsconfigResolver.convertScriptTarget(ScriptTarget.ES2020)).toBe("es2020");
			expect(TsconfigResolver.convertScriptTarget(ScriptTarget.ES2021)).toBe("es2021");
			expect(TsconfigResolver.convertScriptTarget(ScriptTarget.ES2023)).toBe("es2023");
			expect(TsconfigResolver.convertScriptTarget(ScriptTarget.ES2024)).toBe("es2024");
		});

		it("should handle unknown future target values via fallback", () => {
			// Simulate an unknown future ES version (e.g., ES2030 = 17)
			const unknownTarget = 17 as ScriptTarget;
			expect(TsconfigResolver.convertScriptTarget(unknownTarget)).toBe("es17");
		});
	});

	describe("static convertModuleKind", () => {
		it("should convert NodeNext module", () => {
			expect(TsconfigResolver.convertModuleKind(ModuleKind.NodeNext)).toBe("nodenext");
		});

		it("should convert ESNext module", () => {
			expect(TsconfigResolver.convertModuleKind(ModuleKind.ESNext)).toBe("esnext");
		});

		it("should convert CommonJS module", () => {
			expect(TsconfigResolver.convertModuleKind(ModuleKind.CommonJS)).toBe("commonjs");
		});

		it("should convert Node16 module", () => {
			expect(TsconfigResolver.convertModuleKind(ModuleKind.Node16)).toBe("node16");
		});

		it("should convert Preserve module", () => {
			expect(TsconfigResolver.convertModuleKind(ModuleKind.Preserve)).toBe("preserve");
		});

		it("should return undefined for undefined input", () => {
			expect(TsconfigResolver.convertModuleKind(undefined)).toBeUndefined();
		});

		it("should handle other module kinds", () => {
			expect(TsconfigResolver.convertModuleKind(ModuleKind.AMD)).toBe("amd");
			expect(TsconfigResolver.convertModuleKind(ModuleKind.UMD)).toBe("umd");
			expect(TsconfigResolver.convertModuleKind(ModuleKind.System)).toBe("system");
			expect(TsconfigResolver.convertModuleKind(ModuleKind.ES2015)).toBe("es2015");
			expect(TsconfigResolver.convertModuleKind(ModuleKind.ES2020)).toBe("es2020");
			expect(TsconfigResolver.convertModuleKind(ModuleKind.ES2022)).toBe("es2022");
			expect(TsconfigResolver.convertModuleKind(ModuleKind.None)).toBe("none");
		});

		it("should convert Node18 module (enum value 101)", () => {
			expect(TsconfigResolver.convertModuleKind(101 as ModuleKind)).toBe("node18");
		});

		it("should convert Node20 module (enum value 102)", () => {
			expect(TsconfigResolver.convertModuleKind(102 as ModuleKind)).toBe("node20");
		});

		it("should handle unknown future module kind values via fallback", () => {
			// Simulate an unknown future module kind (e.g., 999)
			const unknownModule = 999 as ModuleKind;
			expect(TsconfigResolver.convertModuleKind(unknownModule)).toBe("999");
		});
	});

	describe("static convertModuleResolution", () => {
		it("should convert NodeNext resolution", () => {
			expect(TsconfigResolver.convertModuleResolution(ModuleResolutionKind.NodeNext)).toBe("nodenext");
		});

		it("should convert Bundler resolution", () => {
			expect(TsconfigResolver.convertModuleResolution(ModuleResolutionKind.Bundler)).toBe("bundler");
		});

		it("should convert Node16 resolution", () => {
			expect(TsconfigResolver.convertModuleResolution(ModuleResolutionKind.Node16)).toBe("node16");
		});

		it("should convert NodeJs resolution to node10 (NodeJs is deprecated alias for Node10)", () => {
			// NodeJs and Node10 share the same enum value (2)
			expect(TsconfigResolver.convertModuleResolution(ModuleResolutionKind.NodeJs)).toBe("node10");
		});

		it("should convert Classic resolution", () => {
			expect(TsconfigResolver.convertModuleResolution(ModuleResolutionKind.Classic)).toBe("classic");
		});

		it("should return undefined for undefined input", () => {
			expect(TsconfigResolver.convertModuleResolution(undefined)).toBeUndefined();
		});

		it("should handle unknown future resolution kind values via fallback", () => {
			// Simulate an unknown future resolution kind (e.g., 999)
			const unknownResolution = 999 as ModuleResolutionKind;
			expect(TsconfigResolver.convertModuleResolution(unknownResolution)).toBe("999");
		});
	});

	describe("static convertJsxEmit", () => {
		it("should convert react-jsx", () => {
			expect(TsconfigResolver.convertJsxEmit(JsxEmit.ReactJSX)).toBe("react-jsx");
		});

		it("should convert preserve", () => {
			expect(TsconfigResolver.convertJsxEmit(JsxEmit.Preserve)).toBe("preserve");
		});

		it("should convert react", () => {
			expect(TsconfigResolver.convertJsxEmit(JsxEmit.React)).toBe("react");
		});

		it("should convert react-native", () => {
			expect(TsconfigResolver.convertJsxEmit(JsxEmit.ReactNative)).toBe("react-native");
		});

		it("should convert react-jsxdev", () => {
			expect(TsconfigResolver.convertJsxEmit(JsxEmit.ReactJSXDev)).toBe("react-jsxdev");
		});

		it("should convert none", () => {
			expect(TsconfigResolver.convertJsxEmit(JsxEmit.None)).toBe("none");
		});

		it("should return undefined for undefined input", () => {
			expect(TsconfigResolver.convertJsxEmit(undefined)).toBeUndefined();
		});

		it("should handle unknown future jsx emit values via fallback", () => {
			// Simulate an unknown future JSX mode (e.g., 999)
			const unknownJsx = 999 as JsxEmit;
			expect(TsconfigResolver.convertJsxEmit(unknownJsx)).toBe("999");
		});
	});

	describe("static convertModuleDetection", () => {
		it("should convert auto", () => {
			expect(TsconfigResolver.convertModuleDetection(ModuleDetectionKind.Auto)).toBe("auto");
		});

		it("should convert force", () => {
			expect(TsconfigResolver.convertModuleDetection(ModuleDetectionKind.Force)).toBe("force");
		});

		it("should convert legacy", () => {
			expect(TsconfigResolver.convertModuleDetection(ModuleDetectionKind.Legacy)).toBe("legacy");
		});

		it("should return undefined for undefined input", () => {
			expect(TsconfigResolver.convertModuleDetection(undefined)).toBeUndefined();
		});

		it("should handle unknown future module detection values via fallback", () => {
			// Simulate an unknown future detection mode (e.g., 999)
			const unknownDetection = 999 as ModuleDetectionKind;
			expect(TsconfigResolver.convertModuleDetection(unknownDetection)).toBe("999");
		});
	});

	describe("static convertNewLine", () => {
		it("should convert lf", () => {
			expect(TsconfigResolver.convertNewLine(NewLineKind.LineFeed)).toBe("lf");
		});

		it("should convert crlf", () => {
			expect(TsconfigResolver.convertNewLine(NewLineKind.CarriageReturnLineFeed)).toBe("crlf");
		});

		it("should return undefined for undefined input", () => {
			expect(TsconfigResolver.convertNewLine(undefined)).toBeUndefined();
		});

		it("should handle unknown future newline kind values via fallback", () => {
			// Simulate an unknown future newline kind (e.g., 999)
			const unknownNewLine = 999 as NewLineKind;
			expect(TsconfigResolver.convertNewLine(unknownNewLine)).toBe("999");
		});
	});

	describe("static convertImportsNotUsedAsValues", () => {
		it("should convert remove", () => {
			expect(TsconfigResolver.convertImportsNotUsedAsValues(ImportsNotUsedAsValues.Remove)).toBe("remove");
		});

		it("should convert preserve", () => {
			expect(TsconfigResolver.convertImportsNotUsedAsValues(ImportsNotUsedAsValues.Preserve)).toBe("preserve");
		});

		it("should convert error", () => {
			expect(TsconfigResolver.convertImportsNotUsedAsValues(ImportsNotUsedAsValues.Error)).toBe("error");
		});

		it("should return undefined for undefined input", () => {
			expect(TsconfigResolver.convertImportsNotUsedAsValues(undefined)).toBeUndefined();
		});

		it("should handle unknown future importsNotUsedAsValues values via fallback", () => {
			// Simulate an unknown future value (e.g., 999)
			const unknownValue = 999 as ImportsNotUsedAsValues;
			expect(TsconfigResolver.convertImportsNotUsedAsValues(unknownValue)).toBe("999");
		});
	});

	describe("static convertLibReference", () => {
		it("should convert lib.esnext.d.ts to esnext", () => {
			expect(TsconfigResolver.convertLibReference("lib.esnext.d.ts")).toBe("esnext");
		});

		it("should convert lib.dom.d.ts to dom", () => {
			expect(TsconfigResolver.convertLibReference("lib.dom.d.ts")).toBe("dom");
		});

		it("should convert lib.es2022.d.ts to es2022", () => {
			expect(TsconfigResolver.convertLibReference("lib.es2022.d.ts")).toBe("es2022");
		});

		it("should handle full path with forward slashes", () => {
			expect(TsconfigResolver.convertLibReference("/path/to/node_modules/typescript/lib/lib.dom.d.ts")).toBe("dom");
		});

		it("should handle full path with backslashes", () => {
			expect(TsconfigResolver.convertLibReference("C:\\path\\to\\node_modules\\typescript\\lib\\lib.dom.d.ts")).toBe(
				"dom",
			);
		});

		it("should handle compound lib names", () => {
			expect(TsconfigResolver.convertLibReference("lib.es2022.intl.d.ts")).toBe("es2022.intl");
			expect(TsconfigResolver.convertLibReference("lib.esnext.array.d.ts")).toBe("esnext.array");
		});
	});

	describe("resolve method", () => {
		it("should include $schema in output", () => {
			const resolver = new TsconfigResolver();
			const parsed: ParsedCommandLine = {
				options: {},
				fileNames: [],
				errors: [],
			};
			const result = resolver.resolve(parsed, "/project");
			expect(result.$schema).toBe("https://json.schemastore.org/tsconfig");
		});

		it("should convert target enum", () => {
			const resolver = new TsconfigResolver();
			const parsed: ParsedCommandLine = {
				options: { target: ScriptTarget.ES2022 },
				fileNames: [],
				errors: [],
			};
			const result = resolver.resolve(parsed, "/project");
			expect(result.compilerOptions.target).toBe("es2022");
		});

		it("should always set composite to false for resolved configs", () => {
			const resolver = new TsconfigResolver();
			const parsed: ParsedCommandLine = {
				options: { composite: true },
				fileNames: [],
				errors: [],
			};
			const result = resolver.resolve(parsed, "/project");
			// composite should always be false in resolved configs (not for project references)
			expect(result.compilerOptions.composite).toBe(false);
		});

		it("should not include incremental in resolved configs", () => {
			const resolver = new TsconfigResolver();
			const parsed: ParsedCommandLine = {
				options: { incremental: true },
				fileNames: [],
				errors: [],
			};
			const result = resolver.resolve(parsed, "/project");
			// incremental is a build optimization and shouldn't be in resolved configs
			expect(result.compilerOptions).not.toHaveProperty("incremental");
		});

		it("should convert module and moduleResolution enums", () => {
			const resolver = new TsconfigResolver();
			const parsed: ParsedCommandLine = {
				options: {
					module: ModuleKind.NodeNext,
					moduleResolution: ModuleResolutionKind.NodeNext,
				},
				fileNames: [],
				errors: [],
			};
			const result = resolver.resolve(parsed, "/project");
			expect(result.compilerOptions.module).toBe("nodenext");
			expect(result.compilerOptions.moduleResolution).toBe("nodenext");
		});

		it("should convert jsx enum", () => {
			const resolver = new TsconfigResolver();
			const parsed: ParsedCommandLine = {
				options: { jsx: JsxEmit.ReactJSX },
				fileNames: [],
				errors: [],
			};
			const result = resolver.resolve(parsed, "/project");
			expect(result.compilerOptions.jsx).toBe("react-jsx");
		});

		it("should convert lib array", () => {
			const resolver = new TsconfigResolver();
			const parsed: ParsedCommandLine = {
				options: {
					lib: ["lib.esnext.d.ts", "lib.dom.d.ts"],
				},
				fileNames: [],
				errors: [],
			};
			const result = resolver.resolve(parsed, "/project");
			expect(result.compilerOptions.lib).toEqual(["esnext", "dom"]);
		});

		it("should omit build-specific path options", () => {
			const resolver = new TsconfigResolver();
			const parsed: ParsedCommandLine = {
				options: {
					rootDir: "/project/src",
					outDir: "/project/dist",
					declarationDir: "/project/dist/types",
					baseUrl: "/project",
				},
				fileNames: [],
				errors: [],
			};
			const result = resolver.resolve(parsed, "/project");
			// Path options are omitted - they're build-specific and relative to original location
			expect(result.compilerOptions).not.toHaveProperty("rootDir");
			expect(result.compilerOptions).not.toHaveProperty("outDir");
			expect(result.compilerOptions).not.toHaveProperty("declarationDir");
			expect(result.compilerOptions).not.toHaveProperty("baseUrl");
		});

		it("should include boolean options when set", () => {
			const resolver = new TsconfigResolver();
			const parsed: ParsedCommandLine = {
				options: {
					strict: true,
					skipLibCheck: true,
					esModuleInterop: true,
				},
				fileNames: [],
				errors: [],
			};
			const result = resolver.resolve(parsed, "/project");
			expect(result.compilerOptions.strict).toBe(true);
			expect(result.compilerOptions.skipLibCheck).toBe(true);
			expect(result.compilerOptions.esModuleInterop).toBe(true);
		});

		it("should always set noEmit to true for virtual environment", () => {
			const resolver = new TsconfigResolver();
			const parsed: ParsedCommandLine = {
				options: { noEmit: false },
				fileNames: [],
				errors: [],
			};
			const result = resolver.resolve(parsed, "/project");
			expect(result.compilerOptions.noEmit).toBe(true);
		});

		it("should omit emit-related options", () => {
			const resolver = new TsconfigResolver();
			const parsed: ParsedCommandLine = {
				options: {
					declaration: true,
					declarationMap: true,
					emitDeclarationOnly: true,
					sourceMap: true,
					inlineSourceMap: true,
					inlineSources: true,
				},
				fileNames: [],
				errors: [],
			};
			const result = resolver.resolve(parsed, "/project");
			// Emit options are omitted - virtual environment handles emit
			expect(result.compilerOptions).not.toHaveProperty("declaration");
			expect(result.compilerOptions).not.toHaveProperty("declarationMap");
			expect(result.compilerOptions).not.toHaveProperty("emitDeclarationOnly");
			expect(result.compilerOptions).not.toHaveProperty("sourceMap");
			expect(result.compilerOptions).not.toHaveProperty("inlineSourceMap");
			expect(result.compilerOptions).not.toHaveProperty("inlineSources");
		});

		it("should omit undefined options", () => {
			const resolver = new TsconfigResolver();
			const parsed: ParsedCommandLine = {
				options: { strict: true },
				fileNames: [],
				errors: [],
			};
			const result = resolver.resolve(parsed, "/project");
			expect(result.compilerOptions).not.toHaveProperty("target");
			expect(result.compilerOptions).not.toHaveProperty("module");
			expect(result.compilerOptions).not.toHaveProperty("declaration");
		});

		it("should omit include/exclude from resolved config", () => {
			const resolver = new TsconfigResolver();
			const parsed: ParsedCommandLine = {
				options: {},
				fileNames: [],
				errors: [],
				raw: {
					include: ["src/**/*.ts"],
					exclude: ["**/*.test.ts", "node_modules"],
				},
			};
			const result = resolver.resolve(parsed, "/project");
			// include/exclude are omitted because they contain path patterns
			// relative to the original config location
			expect(result).not.toHaveProperty("include");
			expect(result).not.toHaveProperty("exclude");
		});

		it("should omit paths option (path-dependent)", () => {
			const resolver = new TsconfigResolver();
			const parsed: ParsedCommandLine = {
				options: {
					paths: {
						"@/*": ["src/*"],
						"@components/*": ["src/components/*"],
					},
				},
				fileNames: [],
				errors: [],
			};
			const result = resolver.resolve(parsed, "/project");
			// paths are omitted - they're relative to baseUrl which is also omitted
			expect(result.compilerOptions).not.toHaveProperty("paths");
		});

		it("should omit types and typeRoots", () => {
			const resolver = new TsconfigResolver();
			const parsed: ParsedCommandLine = {
				options: {
					types: ["node", "jest"],
					typeRoots: ["/project/types", "/project/node_modules/@types"],
				},
				fileNames: [],
				errors: [],
			};
			const result = resolver.resolve(parsed, "/project");
			// types is omitted - let TypeScript use default @types auto-discovery
			expect(result.compilerOptions).not.toHaveProperty("types");
			// typeRoots is omitted (path-dependent)
			expect(result.compilerOptions).not.toHaveProperty("typeRoots");
		});

		it("should handle moduleDetection", () => {
			const resolver = new TsconfigResolver();
			const parsed: ParsedCommandLine = {
				options: { moduleDetection: ModuleDetectionKind.Force },
				fileNames: [],
				errors: [],
			};
			const result = resolver.resolve(parsed, "/project");
			expect(result.compilerOptions.moduleDetection).toBe("force");
		});

		it("should handle newLine option", () => {
			const resolver = new TsconfigResolver();
			const parsed: ParsedCommandLine = {
				options: { newLine: NewLineKind.LineFeed },
				fileNames: [],
				errors: [],
			};
			const result = resolver.resolve(parsed, "/project");
			expect(result.compilerOptions.newLine).toBe("lf");
		});

		it("should handle verbatimModuleSyntax", () => {
			const resolver = new TsconfigResolver();
			const parsed: ParsedCommandLine = {
				options: { verbatimModuleSyntax: true },
				fileNames: [],
				errors: [],
			};
			const result = resolver.resolve(parsed, "/project");
			expect(result.compilerOptions.verbatimModuleSyntax).toBe(true);
		});

		it("should handle isolatedDeclarations", () => {
			const resolver = new TsconfigResolver();
			const parsed: ParsedCommandLine = {
				options: { isolatedDeclarations: true },
				fileNames: [],
				errors: [],
			};
			const result = resolver.resolve(parsed, "/project");
			expect(result.compilerOptions.isolatedDeclarations).toBe(true);
		});

		it("should handle importsNotUsedAsValues (deprecated option)", () => {
			const resolver = new TsconfigResolver();
			const parsed: ParsedCommandLine = {
				options: { importsNotUsedAsValues: ImportsNotUsedAsValues.Preserve },
				fileNames: [],
				errors: [],
			};
			const result = resolver.resolve(parsed, "/project");
			expect(result.compilerOptions.importsNotUsedAsValues).toBe("preserve");
		});
	});
});
