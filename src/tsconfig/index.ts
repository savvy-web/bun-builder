import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import type { InspectOptions } from "node:util";
import { inspect } from "node:util";
// biome-ignore lint/correctness/useImportExtensions: we can import JSON files directly
import nodeEcmaLibJson from "../public/tsconfig/ecma/lib.json" with { type: "json" };
import type { TSConfigJsonWithSchema } from "../types/tsconfig-json.js";

// Create require for CJS dependencies like tmp
// biome-ignore lint/suspicious/noExplicitAny: createRequire returns a require function with any type
const requireCJS: (id: string) => any = createRequire(import.meta.url);

// Map of imported JSON files by their file path
const jsonImports: Map<string, TSConfigJsonWithSchema> = new Map<string, TSConfigJsonWithSchema>([
	[join(import.meta.dirname, "../public/tsconfig/ecma/lib.json"), nodeEcmaLibJson as TSConfigJsonWithSchema],
]);

/**
 * Recursively transforms all string values in an object by applying a transformation function.
 *
 * @remarks
 * This function deeply traverses an object structure and applies a transformation to all strings:
 * - String values: transformed directly
 * - Arrays: recursively processed, transforming all strings within
 * - Objects: recursively processed for all properties
 * - Other types: returned unchanged
 *
 * @param value - The value to transform (can be any type)
 * @param transform - Function to apply to each string
 * @returns The transformed value with the same structure
 * @internal
 */
export function transformStringsDeep<T>(value: T, transform: (str: string) => string): T {
	// Handle null and undefined
	if (value === null || value === undefined) {
		return value;
	}

	// Handle strings
	if (typeof value === "string") {
		return transform(value) as T;
	}

	// Handle arrays
	if (Array.isArray(value)) {
		return value.map((item) => transformStringsDeep(item, transform)) as T;
	}

	// Handle objects
	if (typeof value === "object") {
		const result: Record<string, unknown> = {};
		for (const [key, val] of Object.entries(value)) {
			result[key] = transformStringsDeep(val, transform);
		}
		return result as T;
	}

	// Return primitives unchanged (numbers, booleans, etc.)
	return value;
}

/**
 * Represents a TypeScript configuration file with utilities for path resolution.
 *
 * @remarks
 * This class provides convenient access to TypeScript configuration files,
 * with automatic path resolution and JSON parsing. It implements custom
 * inspection for improved debugging output in Node.js console.
 *
 * The class handles workspace-aware path resolution that correctly handles
 * cross-package references by using node_modules symlinks when crossing
 * package boundaries.
 *
 * The class uses lazy getters for both path resolution and configuration
 * parsing, ensuring that file I/O only occurs when these properties are
 * accessed. This makes it efficient to create instances without immediately
 * reading from disk.
 *
 * This base class is suitable for workspace-level configurations. For library
 * build configurations that require bundle transformations, use
 * {@link LibraryTSConfigFile}.
 *
 * @see {@link LibraryTSConfigFile} for library build configurations
 * @internal
 */
export class TSConfigFile {
	/**
	 * Human-readable description of what this configuration is used for.
	 *
	 * @remarks
	 * This description helps developers understand the purpose and intended use
	 * case for this particular TypeScript configuration.
	 */
	public readonly description: string;

	/**
	 * Relative path from current working directory to the config file.
	 *
	 * @remarks
	 * Returns a relative path string prefixed with `./` that points from the
	 * current working directory to the TypeScript configuration file. This is
	 * useful for displaying user-friendly paths in logs and error messages.
	 *
	 * The path is computed lazily each time it's accessed, so it will reflect
	 * changes if the current working directory changes during execution.
	 *
	 * @returns A relative path string with `./` prefix (e.g., `./tsconfig/ecma/lib.json`)
	 */
	/* v8 ignore next -- @preserve */
	get path(): string {
		return `./${relative(process.cwd(), this.pathname)}`;
	}

	/**
	 * Get configuration with `$\{configDir\}` variables replaced.
	 *
	 * @remarks
	 * Returns the configuration with all `${configDir}` template variables replaced
	 * with the relative path to the package root. This is useful for configurations
	 * that use template variables for path resolution.
	 *
	 * @returns The configuration with transformed paths
	 */
	/* v8 ignore next -- @preserve */
	get bundled(): TSConfigJsonWithSchema {
		const config = this.config;
		return transformStringsDeep(config, (str) =>
			// biome-ignore lint/suspicious/noTemplateCurlyInString: replacing an actual literal
			str.replace("${configDir}", "../../../../../.."),
		);
	}

	/**
	 * Parsed TypeScript configuration object.
	 *
	 * @remarks
	 * Returns the TypeScript configuration object imported at build time.
	 * The configuration object includes standard TypeScript compiler options
	 * and other tsconfig.json fields with JSON schema validation.
	 *
	 * @returns The parsed TypeScript configuration as a {@link TSConfigJsonWithSchema} object
	 *
	 * @throws If the configuration file is not found in imports
	 *
	 * @see {@link TSConfigJsonWithSchema} for the configuration type definition
	 */
	/* v8 ignore next -- @preserve */
	get config(): TSConfigJsonWithSchema {
		const imported = jsonImports.get(this.pathname);
		if (!imported) {
			throw new Error(`Config file not found in imports: ${this.pathname}`);
		}
		return imported;
	}

	/**
	 * Creates a new TSConfigFile instance.
	 *
	 * @remarks
	 * Initializes a TSConfigFile with the specified description and absolute path
	 * to a TypeScript configuration file. The constructor sets up lazy getters for
	 * the `path` and `config` properties using `Object.defineProperty`, making
	 * them enumerable but computed on demand.
	 *
	 * Additionally, it configures custom Node.js inspection behavior via
	 * `util.inspect.custom` to provide pretty-printed output when the
	 * instance is logged to the console. This includes showing all nested
	 * levels, colors, and unlimited array lengths for better debugging.
	 *
	 * No file I/O occurs during construction - files are only read when
	 * the `config` getter is accessed.
	 *
	 * @param description - Human-readable description of what this configuration is used for
	 * @param pathname - Absolute path to the TypeScript configuration file
	 */
	constructor(
		description: string,
		public pathname: string,
	) {
		this.description = description;

		// Define custom inspect for Node.js console.log with deep inspection
		Object.defineProperty(this, inspect.custom, {
			value: (_depth: number, options: InspectOptions) =>
				inspect(
					{
						description: this.description,
						pathname: this.pathname,
						path: this.path,
						config: this.config,
						bundled: this.bundled,
					},
					{
						...options,
						depth: null, // Show all nested levels
						colors: options.colors ?? true,
						maxArrayLength: null,
						breakLength: 80,
					},
				),
		});
	}
}

/**
 * Represents a TypeScript configuration file for library builds.
 *
 * @remarks
 * This class extends {@link TSConfigFile} to add library-specific build methods for
 * generating bundled build configurations. It provides methods to:
 * - Generate build-mode specific configurations
 * - Write temporary configuration files for build tools
 * - Transform paths and filter includes based on build mode
 *
 * @see {@link TSConfigFile} for the base class
 * @internal
 */
export class LibraryTSConfigFile extends TSConfigFile {
	/**
	 * Get bundle-mode configuration with transformed paths.
	 *
	 * @remarks
	 * This method transforms the base configuration for bundle mode by:
	 * - Replacing `${configDir}` with absolute relative paths (../../../../../../)
	 * - Filtering include to only src and public directories
	 * - Only including .ts and .mts files (no .tsx, .cts)
	 * - Setting rootDir to the project root
	 * - Setting outDir to just "dist"
	 * - Changing tsBuildInfoFile to include target: `dist/.tsbuildinfo.{target}.bundle`
	 *
	 * @param target - Build target (dev, npm)
	 */
	bundle(target: "dev" | "npm"): TSConfigJsonWithSchema {
		const config = transformStringsDeep(this.config, (str) =>
			// biome-ignore lint/suspicious/noTemplateCurlyInString: replacing an actual literal
			str.replace("${configDir}", "../../../../../.."),
		);

		// Filter include patterns for bundle mode
		const include = config.include
			?.filter((pattern) => {
				// Only include src/**/*.ts, src/**/*.mts, types/*.ts, package.json, and public/**/*.json
				return (
					pattern.includes("/src/") ||
					pattern.includes("/types/") ||
					pattern.includes("/public/") ||
					pattern.includes("package.json")
				);
			})
			.filter((pattern) => {
				// Exclude .tsx and .cts files
				return !pattern.includes(".tsx") && !pattern.includes(".cts");
			});

		return {
			...config,
			compilerOptions: {
				...config.compilerOptions,
				outDir: "dist",
				tsBuildInfoFile: `${process.cwd()}/dist/.tsbuildinfo.${target}.bundle`,
			},
			include,
		};
	}

	/**
	 * Write the bundle-mode configuration to a temporary file.
	 *
	 * @remarks
	 * Creates a temporary tsconfig.json file with the bundle-mode transformations applied.
	 * This is useful for passing to RSlib or other build tools that need a file path.
	 *
	 * The temporary file will be automatically cleaned up when the process exits.
	 *
	 * @param target - Build target (dev, npm)
	 * @returns Absolute path to the temporary file
	 */
	writeBundleTempConfig(target: "dev" | "npm"): string {
		const cwd = process.cwd();
		const config = this.bundle(target);

		// Helper to convert relative paths to absolute
		const toAbsolute = (path: string): string => {
			if (path.startsWith("../") || path === "..") {
				// Replace all leading ../ segments with cwd
				// Handle paths like "../../.." (ending without slash) by adding optional ".." at end
				return path.replace(/^((\.\.\/)+\.\.?|\.\.\/*)$/, cwd).replace(/^(\.\.\/)+/, `${cwd}/`);
			}
			return path;
		};

		// Convert all relative paths to absolute paths since temp file is not in package
		const absoluteConfig = {
			...config,
			compilerOptions: {
				...config.compilerOptions,
				// Set rootDir to package root so TypeScript outputs:
				// - src/rslib/index.ts -> src/rslib/index.d.ts
				// - types/foo.d.ts -> types/foo.d.ts
				// The DtsPlugin will strip the src/ prefix when collecting files
				rootDir: cwd,
				// Override these settings for declaration generation since DtsPlugin uses this config
				// and we need declarationMap enabled and emitDeclarationOnly explicitly false
				// (DtsPlugin will pass --emitDeclarationOnly via CLI args)
				declarationMap: true,
				emitDeclarationOnly: false,
				declarationDir: config.compilerOptions?.declarationDir
					? toAbsolute(config.compilerOptions.declarationDir)
					: undefined,
				typeRoots: config.compilerOptions?.typeRoots?.map(toAbsolute),
			},
			include: config.include?.map(toAbsolute),
			exclude: config.exclude?.map(toAbsolute),
		};

		const tmpFile = requireCJS("tmp").fileSync({ prefix: "tsconfig-bundle-", postfix: ".json" });
		writeFileSync(tmpFile.name, JSON.stringify(absoluteConfig, null, "\t"));
		return tmpFile.name;
	}
}

/**
 * ECMAScript library build configuration for Node.js environments.
 *
 * @remarks
 * This configuration is optimized for building ECMAScript libraries that target Node.js.
 * It includes appropriate compiler options for library distribution, including declaration
 * file generation and module resolution settings suitable for npm packages.
 *
 * This configuration provides build-mode specific methods via {@link LibraryTSConfigFile}
 * for generating bundled build configurations.
 *
 * The JSON config can be extended in a tsconfig.json file:
 * ```json
 * {
 *   "$schema": "https://json.schemastore.org/tsconfig",
 *   "extends": "./node_modules/@savvy-web/rslib-builder/tsconfig/ecma/lib.json",
 *   "compilerOptions": {
 *     "outDir": "./dist"
 *   }
 * }
 * ```
 *
 * @see {@link LibraryTSConfigFile} for available build methods
 * @internal
 */
export const NodeEcmaLib: LibraryTSConfigFile = new LibraryTSConfigFile(
	"ECMAScript library build configuration",
	join(import.meta.dirname, "../public/tsconfig/ecma/lib.json"),
);

/**
 * Collection of all TypeScript configuration files provided by this package.
 *
 * @remarks
 * This is an internal registry that provides access to available TypeScript configurations.
 * It organizes configurations by target environment and build strategy.
 *
 * The structure is organized as:
 * - `node.ecma.lib`: For Node.js libraries (bundled ESM builds)
 *
 * All configurations support workspace-aware path resolution that handles cross-package
 * references correctly by using node_modules symlinks when appropriate.
 *
 * @see {@link TSConfigFile} for the structure of individual configuration objects
 * @see {@link NodeEcmaLib} for library configuration
 * @internal
 */
export const TSConfigs = {
	/** Node.js environment configurations */
	node: {
		/** ECMAScript configurations for Node.js */
		ecma: {
			/** Library mode configuration with declaration file generation */
			lib: NodeEcmaLib,
		},
	},
} as const;
