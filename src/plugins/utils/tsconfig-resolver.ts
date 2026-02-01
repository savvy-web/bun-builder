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

/**
 * Error thrown when tsconfig resolution fails.
 *
 * @remarks
 * This error provides detailed context about what went wrong during
 * tsconfig resolution, including the specific option or configuration
 * that caused the failure.
 *
 * @example
 * ```typescript
 * import { TsconfigResolverError } from '@savvy-web/bun-builder';
 *
 * try {
 *   const resolver = new TsconfigResolver();
 *   const config = resolver.resolve(parsedConfig, '/project');
 * } catch (error) {
 *   if (error instanceof TsconfigResolverError) {
 *     console.error(`Resolution failed: ${error.message}`);
 *     if (error.option) {
 *       console.error(`Problematic option: ${error.option}`);
 *     }
 *   }
 * }
 * ```
 *
 * @internal
 */
export class TsconfigResolverError extends Error {
	/**
	 * The compiler option that caused the error, if applicable.
	 */
	readonly option?: string;

	/**
	 * The value that caused the error, if applicable.
	 */
	readonly value?: unknown;

	constructor(message: string, option?: string, value?: unknown) {
		super(message);
		this.name = "TsconfigResolverError";
		this.option = option;
		this.value = value;
	}
}

/**
 * Resolved tsconfig.json structure for JSON serialization.
 *
 * @remarks
 * This interface represents a flattened tsconfig.json file that can be
 * serialized to JSON. All enum values are converted to their string
 * equivalents, and path-dependent options are excluded.
 *
 * The resolved config is designed for virtual TypeScript environments
 * where file paths and emit settings are controlled externally.
 *
 * **Excluded options:**
 * - Path-dependent: `rootDir`, `outDir`, `baseUrl`, `paths`, `typeRoots`
 * - Emit-related: `declaration`, `sourceMap`, `inlineSourceMap`, etc.
 * - File selection: `include`, `exclude`, `files`, `references`
 *
 * @internal
 */
export interface ResolvedTsconfig {
	/**
	 * JSON schema for IDE support.
	 */
	$schema: string;

	/**
	 * Compiler options with enum values converted to strings.
	 */
	compilerOptions: ResolvedCompilerOptions;
}

/**
 * Compiler options with enum values converted to strings.
 *
 * @remarks
 * This is an open-ended record type because TypeScript compiler options
 * can vary by version. Known options use their proper types internally,
 * but the public interface allows for flexibility.
 *
 * @internal
 */
export interface ResolvedCompilerOptions {
	[key: string]: unknown;
}

/**
 * Resolves TypeScript ParsedCommandLine to a JSON-serializable tsconfig format.
 *
 * @remarks
 * This class converts TypeScript's internal `ParsedCommandLine` representation
 * back to a portable JSON format suitable for virtual TypeScript environments
 * like API Extractor or other tooling that needs type information without
 * actually emitting files.
 *
 * **Key transformations:**
 * - Converts enum values (target, module, jsx, etc.) to their string equivalents
 * - Sets `composite: false` and `noEmit: true` for virtual environment compatibility
 * - Excludes path-dependent options that would be invalid outside the original project
 * - Excludes emit-related options since the virtual environment handles output
 * - Converts lib references from full paths (e.g., "lib.esnext.d.ts") to short names
 *
 * **Static conversion methods:**
 * The class provides static methods for converting individual TypeScript enum
 * values to their string representations. These are useful when you need to
 * convert specific options without creating a full resolver instance.
 *
 * @example Basic usage with ParsedCommandLine
 * ```typescript
 * import { parseJsonConfigFileContent, readConfigFile, sys } from 'typescript';
 * import { TsconfigResolver } from '@savvy-web/bun-builder';
 *
 * // Parse the tsconfig.json using TypeScript API
 * const configFile = readConfigFile('tsconfig.json', sys.readFile.bind(sys));
 * const parsed = parseJsonConfigFileContent(configFile.config, sys, process.cwd());
 *
 * // Resolve to JSON-serializable format
 * const resolver = new TsconfigResolver();
 * const resolved = resolver.resolve(parsed, process.cwd());
 *
 * // Write to file for tooling consumption
 * const json = JSON.stringify(resolved, null, 2);
 * console.log(json);
 * ```
 *
 * @example Using static enum conversion methods
 * ```typescript
 * import { ScriptTarget, ModuleKind } from 'typescript';
 * import { TsconfigResolver } from '@savvy-web/bun-builder';
 *
 * // Convert individual enum values
 * const target = TsconfigResolver.convertScriptTarget(ScriptTarget.ES2022);
 * console.log(target); // "es2022"
 *
 * const module = TsconfigResolver.convertModuleKind(ModuleKind.NodeNext);
 * console.log(module); // "nodenext"
 * ```
 *
 * @internal
 */
export class TsconfigResolver {
	/**
	 * Mapping of ScriptTarget enum values to their string representations.
	 * @internal
	 */
	private static readonly SCRIPT_TARGET_MAP: ReadonlyMap<ScriptTarget, string> = new Map([
		[ScriptTarget.ES3, "es3"],
		[ScriptTarget.ES5, "es5"],
		[ScriptTarget.ES2015, "es2015"],
		[ScriptTarget.ES2016, "es2016"],
		[ScriptTarget.ES2017, "es2017"],
		[ScriptTarget.ES2018, "es2018"],
		[ScriptTarget.ES2019, "es2019"],
		[ScriptTarget.ES2020, "es2020"],
		[ScriptTarget.ES2021, "es2021"],
		[ScriptTarget.ES2022, "es2022"],
		[ScriptTarget.ES2023, "es2023"],
		[ScriptTarget.ES2024, "es2024"],
		[ScriptTarget.ESNext, "esnext"],
		[ScriptTarget.JSON, "json"],
	]);

	/**
	 * Mapping of ModuleKind enum values to their string representations.
	 * @internal
	 */
	private static readonly MODULE_KIND_MAP: ReadonlyMap<ModuleKind | number, string> = new Map([
		[ModuleKind.None, "none"],
		[ModuleKind.CommonJS, "commonjs"],
		[ModuleKind.AMD, "amd"],
		[ModuleKind.UMD, "umd"],
		[ModuleKind.System, "system"],
		[ModuleKind.ES2015, "es2015"],
		[ModuleKind.ES2020, "es2020"],
		[ModuleKind.ES2022, "es2022"],
		[ModuleKind.ESNext, "esnext"],
		[ModuleKind.Node16, "node16"],
		[101, "node18"], // ModuleKind.Node18 (not exported in all TS versions)
		[102, "node20"], // ModuleKind.Node20 (not exported in all TS versions)
		[ModuleKind.NodeNext, "nodenext"],
		[ModuleKind.Preserve, "preserve"],
	]);

	/**
	 * Mapping of ModuleResolutionKind enum values to their string representations.
	 * @internal
	 */
	private static readonly MODULE_RESOLUTION_MAP: ReadonlyMap<ModuleResolutionKind, string> = new Map([
		[ModuleResolutionKind.Classic, "classic"],
		[ModuleResolutionKind.Node10, "node10"],
		[ModuleResolutionKind.Node16, "node16"],
		[ModuleResolutionKind.NodeNext, "nodenext"],
		[ModuleResolutionKind.Bundler, "bundler"],
	]);

	/**
	 * Mapping of JsxEmit enum values to their string representations.
	 * @internal
	 */
	private static readonly JSX_EMIT_MAP: ReadonlyMap<JsxEmit, string> = new Map([
		[JsxEmit.None, "none"],
		[JsxEmit.Preserve, "preserve"],
		[JsxEmit.React, "react"],
		[JsxEmit.ReactNative, "react-native"],
		[JsxEmit.ReactJSX, "react-jsx"],
		[JsxEmit.ReactJSXDev, "react-jsxdev"],
	]);

	/**
	 * Mapping of ModuleDetectionKind enum values to their string representations.
	 * @internal
	 */
	private static readonly MODULE_DETECTION_MAP: ReadonlyMap<ModuleDetectionKind, string> = new Map([
		[ModuleDetectionKind.Legacy, "legacy"],
		[ModuleDetectionKind.Auto, "auto"],
		[ModuleDetectionKind.Force, "force"],
	]);

	/**
	 * Mapping of NewLineKind enum values to their string representations.
	 * @internal
	 */
	private static readonly NEW_LINE_MAP: ReadonlyMap<NewLineKind, string> = new Map([
		[NewLineKind.CarriageReturnLineFeed, "crlf"],
		[NewLineKind.LineFeed, "lf"],
	]);

	/**
	 * Mapping of ImportsNotUsedAsValues enum values to their string representations.
	 * @internal
	 */
	private static readonly IMPORTS_NOT_USED_MAP: ReadonlyMap<ImportsNotUsedAsValues, string> = new Map([
		[ImportsNotUsedAsValues.Remove, "remove"],
		[ImportsNotUsedAsValues.Preserve, "preserve"],
		[ImportsNotUsedAsValues.Error, "error"],
	]);

	/**
	 * JSON schema URL for tsconfig.json files.
	 * @internal
	 */
	private static readonly TSCONFIG_SCHEMA_URL = "https://json.schemastore.org/tsconfig";

	/**
	 * Boolean compiler options that are preserved in the resolved config.
	 *
	 * @remarks
	 * These options affect type checking and module semantics without
	 * producing build artifacts. Emit-related options are excluded.
	 *
	 * @internal
	 */
	private static readonly PRESERVED_BOOLEAN_OPTIONS = [
		"strict",
		"strictNullChecks",
		"strictFunctionTypes",
		"strictBindCallApply",
		"strictPropertyInitialization",
		"noImplicitAny",
		"noImplicitThis",
		"alwaysStrict",
		"noUnusedLocals",
		"noUnusedParameters",
		"exactOptionalPropertyTypes",
		"noImplicitReturns",
		"noFallthroughCasesInSwitch",
		"noUncheckedIndexedAccess",
		"noImplicitOverride",
		"noPropertyAccessFromIndexSignature",
		"allowUnusedLabels",
		"allowUnreachableCode",
		"esModuleInterop",
		"allowSyntheticDefaultImports",
		"forceConsistentCasingInFileNames",
		"resolveJsonModule",
		"isolatedModules",
		"verbatimModuleSyntax",
		"skipLibCheck",
		"skipDefaultLibCheck",
		"downlevelIteration",
		"importHelpers",
		"preserveConstEnums",
		"isolatedDeclarations",
		"allowImportingTsExtensions",
		"rewriteRelativeImportExtensions",
		"allowArbitraryExtensions",
		"useDefineForClassFields",
		"noLib",
		"preserveSymlinks",
	] as const;

	/**
	 * String compiler options that are preserved in the resolved config.
	 * @internal
	 */
	private static readonly PRESERVED_STRING_OPTIONS = [
		"jsxFactory",
		"jsxFragmentFactory",
		"jsxImportSource",
		"reactNamespace",
		"declarationMapBuildInfo",
	] as const;

	/**
	 * Converts a TypeScript ScriptTarget enum value to its string representation.
	 *
	 * @remarks
	 * Handles all standard ECMAScript targets including the special cases
	 * where `ESNext` and `Latest` share the same numeric value (99).
	 *
	 * @param target - The ScriptTarget enum value to convert
	 * @returns The string representation (e.g., "es2022", "esnext"), or undefined if input is undefined
	 *
	 * @example
	 * ```typescript
	 * import { ScriptTarget } from 'typescript';
	 * import { TsconfigResolver } from '@savvy-web/bun-builder';
	 *
	 * const result = TsconfigResolver.convertScriptTarget(ScriptTarget.ES2022);
	 * console.log(result); // "es2022"
	 *
	 * const latest = TsconfigResolver.convertScriptTarget(ScriptTarget.Latest);
	 * console.log(latest); // "esnext"
	 * ```
	 *
	 */
	static convertScriptTarget(target: ScriptTarget | undefined): string | undefined {
		if (target === undefined) {
			return undefined;
		}

		const mapped = TsconfigResolver.SCRIPT_TARGET_MAP.get(target);
		if (mapped !== undefined) {
			return mapped;
		}

		// Fallback for unknown future targets
		return `es${target}`;
	}

	/**
	 * Converts a TypeScript ModuleKind enum value to its string representation.
	 *
	 * @remarks
	 * Handles all standard module systems including Node.js-specific module
	 * kinds like `Node16`, `Node18`, `Node20`, and `NodeNext`.
	 *
	 * Note: `Node18` (101) and `Node20` (102) are handled by their numeric
	 * values since they may not be exported in all TypeScript versions.
	 *
	 * @param module - The ModuleKind enum value to convert
	 * @returns The string representation (e.g., "nodenext", "esnext"), or undefined if input is undefined
	 *
	 * @example
	 * ```typescript
	 * import { ModuleKind } from 'typescript';
	 * import { TsconfigResolver } from '@savvy-web/bun-builder';
	 *
	 * const nodeNext = TsconfigResolver.convertModuleKind(ModuleKind.NodeNext);
	 * console.log(nodeNext); // "nodenext"
	 *
	 * const esm = TsconfigResolver.convertModuleKind(ModuleKind.ESNext);
	 * console.log(esm); // "esnext"
	 * ```
	 *
	 */
	static convertModuleKind(module: ModuleKind | undefined): string | undefined {
		if (module === undefined) {
			return undefined;
		}

		const mapped = TsconfigResolver.MODULE_KIND_MAP.get(module);
		if (mapped !== undefined) {
			return mapped;
		}

		// Fallback for unknown future module kinds
		return String(module);
	}

	/**
	 * Converts a TypeScript ModuleResolutionKind enum value to its string representation.
	 *
	 * @remarks
	 * Maps module resolution strategies to their tsconfig.json equivalents.
	 * Note that `NodeJs` is a deprecated alias for `Node10` and both share
	 * the same numeric value (2).
	 *
	 * @param resolution - The ModuleResolutionKind enum value to convert
	 * @returns The string representation (e.g., "nodenext", "bundler"), or undefined if input is undefined
	 *
	 * @example
	 * ```typescript
	 * import { ModuleResolutionKind } from 'typescript';
	 * import { TsconfigResolver } from '@savvy-web/bun-builder';
	 *
	 * const bundler = TsconfigResolver.convertModuleResolution(ModuleResolutionKind.Bundler);
	 * console.log(bundler); // "bundler"
	 *
	 * const nodeNext = TsconfigResolver.convertModuleResolution(ModuleResolutionKind.NodeNext);
	 * console.log(nodeNext); // "nodenext"
	 * ```
	 *
	 */
	static convertModuleResolution(resolution: ModuleResolutionKind | undefined): string | undefined {
		if (resolution === undefined) {
			return undefined;
		}

		const mapped = TsconfigResolver.MODULE_RESOLUTION_MAP.get(resolution);
		if (mapped !== undefined) {
			return mapped;
		}

		// Fallback for unknown future resolution kinds
		return String(resolution);
	}

	/**
	 * Converts a TypeScript JsxEmit enum value to its string representation.
	 *
	 * @remarks
	 * Maps JSX transformation modes to their tsconfig.json equivalents.
	 * Includes both classic React modes and the modern `react-jsx` transform.
	 *
	 * @param jsx - The JsxEmit enum value to convert
	 * @returns The string representation (e.g., "react-jsx", "preserve"), or undefined if input is undefined
	 *
	 * @example
	 * ```typescript
	 * import { JsxEmit } from 'typescript';
	 * import { TsconfigResolver } from '@savvy-web/bun-builder';
	 *
	 * const reactJsx = TsconfigResolver.convertJsxEmit(JsxEmit.ReactJSX);
	 * console.log(reactJsx); // "react-jsx"
	 *
	 * const preserve = TsconfigResolver.convertJsxEmit(JsxEmit.Preserve);
	 * console.log(preserve); // "preserve"
	 * ```
	 *
	 */
	static convertJsxEmit(jsx: JsxEmit | undefined): string | undefined {
		if (jsx === undefined) {
			return undefined;
		}

		const mapped = TsconfigResolver.JSX_EMIT_MAP.get(jsx);
		if (mapped !== undefined) {
			return mapped;
		}

		// Fallback for unknown future JSX modes
		return String(jsx);
	}

	/**
	 * Converts a TypeScript ModuleDetectionKind enum value to its string representation.
	 *
	 * @remarks
	 * Maps module detection strategies that control how TypeScript determines
	 * whether a file is a module or a script.
	 *
	 * @param detection - The ModuleDetectionKind enum value to convert
	 * @returns The string representation (e.g., "auto", "force"), or undefined if input is undefined
	 *
	 * @example
	 * ```typescript
	 * import { ModuleDetectionKind } from 'typescript';
	 * import { TsconfigResolver } from '@savvy-web/bun-builder';
	 *
	 * const auto = TsconfigResolver.convertModuleDetection(ModuleDetectionKind.Auto);
	 * console.log(auto); // "auto"
	 *
	 * const force = TsconfigResolver.convertModuleDetection(ModuleDetectionKind.Force);
	 * console.log(force); // "force"
	 * ```
	 *
	 */
	static convertModuleDetection(detection: ModuleDetectionKind | undefined): string | undefined {
		if (detection === undefined) {
			return undefined;
		}

		const mapped = TsconfigResolver.MODULE_DETECTION_MAP.get(detection);
		if (mapped !== undefined) {
			return mapped;
		}

		// Fallback for unknown future detection kinds
		return String(detection);
	}

	/**
	 * Converts a TypeScript NewLineKind enum value to its string representation.
	 *
	 * @remarks
	 * Maps line ending preferences to their tsconfig.json equivalents.
	 *
	 * @param newLine - The NewLineKind enum value to convert
	 * @returns The string representation ("lf" or "crlf"), or undefined if input is undefined
	 *
	 * @example
	 * ```typescript
	 * import { NewLineKind } from 'typescript';
	 * import { TsconfigResolver } from '@savvy-web/bun-builder';
	 *
	 * const lf = TsconfigResolver.convertNewLine(NewLineKind.LineFeed);
	 * console.log(lf); // "lf"
	 *
	 * const crlf = TsconfigResolver.convertNewLine(NewLineKind.CarriageReturnLineFeed);
	 * console.log(crlf); // "crlf"
	 * ```
	 *
	 */
	static convertNewLine(newLine: NewLineKind | undefined): string | undefined {
		if (newLine === undefined) {
			return undefined;
		}

		const mapped = TsconfigResolver.NEW_LINE_MAP.get(newLine);
		if (mapped !== undefined) {
			return mapped;
		}

		// Fallback for unknown future new line kinds
		return String(newLine);
	}

	/**
	 * Converts a TypeScript ImportsNotUsedAsValues enum value to its string representation.
	 *
	 * @remarks
	 * This option is deprecated in TypeScript 5.0+ in favor of `verbatimModuleSyntax`,
	 * but is still supported for backwards compatibility with older configurations.
	 *
	 * @param importsNotUsedAsValues - The ImportsNotUsedAsValues enum value to convert
	 * @returns The string representation (e.g., "remove", "preserve", "error"), or undefined if input is undefined
	 *
	 * @example
	 * ```typescript
	 * import { ImportsNotUsedAsValues } from 'typescript';
	 * import { TsconfigResolver } from '@savvy-web/bun-builder';
	 *
	 * const preserve = TsconfigResolver.convertImportsNotUsedAsValues(ImportsNotUsedAsValues.Preserve);
	 * console.log(preserve); // "preserve"
	 * ```
	 *
	 */
	static convertImportsNotUsedAsValues(importsNotUsedAsValues: ImportsNotUsedAsValues | undefined): string | undefined {
		if (importsNotUsedAsValues === undefined) {
			return undefined;
		}

		const mapped = TsconfigResolver.IMPORTS_NOT_USED_MAP.get(importsNotUsedAsValues);
		if (mapped !== undefined) {
			return mapped;
		}

		// Fallback for unknown future values
		return String(importsNotUsedAsValues);
	}

	/**
	 * Converts a lib reference to its canonical name.
	 *
	 * @remarks
	 * TypeScript's `ParsedCommandLine` stores lib references as full paths like
	 * `lib.esnext.d.ts` or `/path/to/node_modules/typescript/lib/lib.dom.d.ts`.
	 * This method converts them to the canonical short form used in tsconfig.json
	 * like `esnext` or `dom`.
	 *
	 * @param lib - The lib reference (e.g., "lib.esnext.d.ts" or "/path/to/lib.dom.d.ts")
	 * @returns The canonical name (e.g., "esnext", "dom")
	 *
	 * @example
	 * ```typescript
	 * import { TsconfigResolver } from '@savvy-web/bun-builder';
	 *
	 * const lib1 = TsconfigResolver.convertLibReference('lib.esnext.d.ts');
	 * console.log(lib1); // "esnext"
	 *
	 * const lib2 = TsconfigResolver.convertLibReference('/path/to/lib.dom.d.ts');
	 * console.log(lib2); // "dom"
	 *
	 * const lib3 = TsconfigResolver.convertLibReference('lib.es2022.intl.d.ts');
	 * console.log(lib3); // "es2022.intl"
	 * ```
	 *
	 */
	static convertLibReference(lib: string): string {
		// Extract filename if it's a path
		const filename = lib.includes("/") || lib.includes("\\") ? (lib.split(/[\\/]/).pop() ?? lib) : lib;

		// Remove "lib." prefix and ".d.ts" suffix
		return filename.replace(/^lib\./, "").replace(/\.d\.ts$/, "");
	}

	/**
	 * Resolves a TypeScript ParsedCommandLine to a JSON-serializable tsconfig object.
	 *
	 * @remarks
	 * This method transforms the parsed TypeScript configuration into a format
	 * suitable for virtual TypeScript environments. It performs the following:
	 *
	 * - Converts enum values (target, module, moduleResolution, jsx) to strings
	 * - Converts lib array format (lib.esnext.d.ts to esnext)
	 * - Sets `composite: false` for virtual environment compatibility
	 * - Sets `noEmit: true` since the virtual environment handles emit
	 * - Excludes path-dependent options (rootDir, outDir, paths, typeRoots, etc.)
	 * - Excludes emit-related options (declaration, sourceMap, etc.)
	 * - Excludes file selection (include, exclude, files, references)
	 * - Adds $schema for IDE support
	 *
	 * @param parsed - The parsed TypeScript configuration from `parseJsonConfigFileContent`
	 * @param rootDir - The root directory used for path normalization
	 * @returns A JSON-serializable tsconfig object
	 * @throws {@link TsconfigResolverError} If resolution fails for any option
	 *
	 * @example
	 * ```typescript
	 * import { parseJsonConfigFileContent, readConfigFile, sys } from 'typescript';
	 * import { TsconfigResolver } from '@savvy-web/bun-builder';
	 *
	 * const configFile = readConfigFile('tsconfig.json', sys.readFile.bind(sys));
	 * const parsed = parseJsonConfigFileContent(configFile.config, sys, process.cwd());
	 *
	 * const resolver = new TsconfigResolver();
	 * const resolved = resolver.resolve(parsed, process.cwd());
	 *
	 * console.log(JSON.stringify(resolved, null, 2));
	 * ```
	 *
	 */
	resolve(parsed: ParsedCommandLine, _rootDir: string): ResolvedTsconfig {
		const opts = parsed.options;
		const compilerOptions: ResolvedCompilerOptions = {};

		// Convert enum options
		this.addEnumOptions(compilerOptions, opts);

		// Convert lib array
		if (opts.lib && opts.lib.length > 0) {
			compilerOptions.lib = opts.lib.map(TsconfigResolver.convertLibReference);
		}

		// Virtual environment settings (always set)
		compilerOptions.composite = false;
		compilerOptions.noEmit = true;

		// Copy preserved boolean options
		this.addPreservedBooleanOptions(compilerOptions, opts);

		// Copy preserved string options
		this.addPreservedStringOptions(compilerOptions, opts);

		return {
			$schema: TsconfigResolver.TSCONFIG_SCHEMA_URL,
			compilerOptions,
		};
	}

	/**
	 * Adds converted enum options to the compiler options object.
	 * @internal
	 */
	private addEnumOptions(compilerOptions: ResolvedCompilerOptions, opts: ParsedCommandLine["options"]): void {
		if (opts.target !== undefined) {
			compilerOptions.target = TsconfigResolver.convertScriptTarget(opts.target);
		}
		if (opts.module !== undefined) {
			compilerOptions.module = TsconfigResolver.convertModuleKind(opts.module);
		}
		if (opts.moduleResolution !== undefined) {
			compilerOptions.moduleResolution = TsconfigResolver.convertModuleResolution(opts.moduleResolution);
		}
		if (opts.moduleDetection !== undefined) {
			compilerOptions.moduleDetection = TsconfigResolver.convertModuleDetection(opts.moduleDetection);
		}
		if (opts.jsx !== undefined) {
			compilerOptions.jsx = TsconfigResolver.convertJsxEmit(opts.jsx);
		}
		if (opts.newLine !== undefined) {
			compilerOptions.newLine = TsconfigResolver.convertNewLine(opts.newLine);
		}
		if (opts.importsNotUsedAsValues !== undefined) {
			compilerOptions.importsNotUsedAsValues = TsconfigResolver.convertImportsNotUsedAsValues(
				opts.importsNotUsedAsValues,
			);
		}
	}

	/**
	 * Adds preserved boolean options to the compiler options object.
	 * @internal
	 */
	private addPreservedBooleanOptions(
		compilerOptions: ResolvedCompilerOptions,
		opts: ParsedCommandLine["options"],
	): void {
		for (const opt of TsconfigResolver.PRESERVED_BOOLEAN_OPTIONS) {
			if (opts[opt] !== undefined) {
				compilerOptions[opt] = opts[opt];
			}
		}
	}

	/**
	 * Adds preserved string options to the compiler options object.
	 * @internal
	 */
	private addPreservedStringOptions(
		compilerOptions: ResolvedCompilerOptions,
		opts: ParsedCommandLine["options"],
	): void {
		for (const opt of TsconfigResolver.PRESERVED_STRING_OPTIONS) {
			if (opts[opt] !== undefined) {
				compilerOptions[opt] = opts[opt];
			}
		}
	}
}
