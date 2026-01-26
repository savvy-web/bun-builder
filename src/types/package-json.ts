/**
 * Package.json type definitions.
 *
 * @remarks
 * This is a local copy of type-fest's PackageJson types with TSDoc fixes.
 * Original source: https://github.com/sindresorhus/type-fest
 *
 * TSDoc fixes applied:
 * - Added deprecation messages to `@deprecated` tags
 * - Fixed code fence formatting in `packageManager` docs
 *
 */

/**
 * Matches any valid JSON primitive value.
 *
 * @public
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * Matches a JSON object.
 *
 * @remarks
 * This type can be useful to enforce some input to be JSON-compatible or as a
 * super-type to be extended from.
 *
 * @public
 */
export type JsonObject = { [Key in string]: JsonValue };

/**
 * Matches a JSON array.
 *
 * @public
 */
export type JsonArray = JsonValue[] | readonly JsonValue[];

/**
 * Matches any valid JSON value.
 *
 * @public
 */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/**
 * Matches any primitive value.
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Glossary/Primitive | MDN Primitive}
 *
 * @public
 */
export type Primitive = null | undefined | string | number | boolean | symbol | bigint;

/**
 * Allows creating a union type by combining primitive types and literal types
 * without sacrificing auto-completion in IDEs for the literal type part of the union.
 *
 * @remarks
 * Currently, when a union type of a primitive type is combined with literal types,
 * TypeScript loses all information about the combined literals. Thus, when such
 * type is used in an IDE with autocompletion, no suggestions are made for the
 * declared literals.
 *
 * This type is a workaround for Microsoft/TypeScript#29729.
 *
 * @typeParam LiteralType - The literal type(s) to include
 * @typeParam BaseType - The base primitive type
 *
 * @public
 */
export type LiteralUnion<LiteralType, BaseType extends Primitive> = LiteralType | (BaseType & Record<never, never>);

/**
 * PackageJson namespace containing all sub-types.
 *
 * @public
 */
export namespace PackageJson {
	/**
	 * A person who has been involved in creating or maintaining the package.
	 */
	export type Person =
		| string
		| {
				name: string;
				url?: string;
				email?: string;
		  };

	/**
	 * Location for reporting bugs.
	 */
	export type BugsLocation =
		| string
		| {
				/** The URL to the package's issue tracker. */
				url?: string;
				/** The email address to which issues should be reported. */
				email?: string;
		  };

	/**
	 * Directory locations within the package.
	 */
	export interface DirectoryLocations {
		[directoryType: string]: JsonValue | undefined;
		/** Location for executable scripts. Sugar to generate entries in the `bin` property by walking the folder. */
		bin?: string;
		/** Location for Markdown files. */
		doc?: string;
		/** Location for example scripts. */
		example?: string;
		/** Location for the bulk of the library. */
		lib?: string;
		/** Location for man pages. Sugar to generate a `man` array by walking the folder. */
		man?: string;
		/** Location for test files. */
		test?: string;
	}

	/**
	 * Script commands that are run at various times in the lifecycle of the package.
	 */
	export type Scripts = {
		/** Run before the package is published (Also run on local `npm install` without any arguments). */
		prepublish?: string;
		/** Run both before the package is packed and published, and on local `npm install` without any arguments. */
		prepare?: string;
		/** Run before the package is prepared and packed, only on `npm publish`. */
		prepublishOnly?: string;
		/** Run before a tarball is packed (on `npm pack`, `npm publish`, and when installing git dependencies). */
		prepack?: string;
		/** Run after the tarball has been generated and moved to its final destination. */
		postpack?: string;
		/** Run after the package is published. */
		publish?: string;
		/** Run after the package is published. */
		postpublish?: string;
		/** Run before the package is installed. */
		preinstall?: string;
		/** Run after the package is installed. */
		install?: string;
		/** Run after the package is installed and after `install`. */
		postinstall?: string;
		/** Run before the package is uninstalled and before `uninstall`. */
		preuninstall?: string;
		/** Run before the package is uninstalled. */
		uninstall?: string;
		/** Run after the package is uninstalled. */
		postuninstall?: string;
		/** Run before bump the package version and before `version`. */
		preversion?: string;
		/** Run before bump the package version. */
		version?: string;
		/** Run after bump the package version. */
		postversion?: string;
		/** Run with the `npm test` command, before `test`. */
		pretest?: string;
		/** Run with the `npm test` command. */
		test?: string;
		/** Run with the `npm test` command, after `test`. */
		posttest?: string;
		/** Run with the `npm stop` command, before `stop`. */
		prestop?: string;
		/** Run with the `npm stop` command. */
		stop?: string;
		/** Run with the `npm stop` command, after `stop`. */
		poststop?: string;
		/** Run with the `npm start` command, before `start`. */
		prestart?: string;
		/** Run with the `npm start` command. */
		start?: string;
		/** Run with the `npm start` command, after `start`. */
		poststart?: string;
		/** Run with the `npm restart` command, before `restart`. */
		prerestart?: string;
		/** Run with the `npm restart` command. */
		restart?: string;
		/** Run with the `npm restart` command, after `restart`. */
		postrestart?: string;
	} & Partial<Record<string, string>>;

	/**
	 * Dependencies of the package. The version range is a string which has one or
	 * more space-separated descriptors.
	 */
	export type Dependency = Partial<Record<string, string>>;

	/**
	 * Recursive map describing selective dependency version overrides supported by npm.
	 */
	export type DependencyOverrides = {
		[packageName in string]: string | undefined | DependencyOverrides;
	};

	/**
	 * Specifies requirements for development environment components.
	 */
	export interface DevEngineDependency {
		name: string;
		version?: string;
		onFail?: "ignore" | "warn" | "error" | "download";
	}

	/**
	 * A mapping of conditions and the paths to which they resolve.
	 */
	export interface ExportConditions {
		[condition: string]: Exports;
	}

	/**
	 * Entry points of a module, optionally with conditions and subpath exports.
	 */
	export type Exports = null | string | Array<string | ExportConditions> | ExportConditions;

	/**
	 * Import map entries of a module, optionally with conditions and subpath imports.
	 */
	export interface Imports {
		[key: `#${string}`]: Exports;
	}

	/**
	 * Non-standard entry point fields used by various bundlers.
	 */
	export interface NonStandardEntryPoints {
		/** An ECMAScript module ID that is the primary entry point to the program. */
		module?: string;
		/** A module ID with untranspiled code that is the primary entry point to the program. */
		esnext?:
			| string
			| {
					[moduleName: string]: string | undefined;
					main?: string;
					browser?: string;
			  };
		/** A hint to JavaScript bundlers or component tools when packaging modules for client side use. */
		browser?: string | Partial<Record<string, string | false>>;
		/**
		 * Denote which files in your project are "pure" and therefore safe for Webpack to prune if unused.
		 *
		 * @see {@link https://webpack.js.org/guides/tree-shaking/ | Webpack Tree Shaking}
		 */
		sideEffects?: boolean | string[];
	}

	/**
	 * TypeScript-specific configuration fields.
	 */
	export interface TypeScriptConfiguration {
		/** Location of the bundled TypeScript declaration file. */
		types?: string;
		/** Version selection map of TypeScript. */
		typesVersions?: Partial<Record<string, Partial<Record<string, string[]>>>>;
		/** Location of the bundled TypeScript declaration file. Alias of `types`. */
		typings?: string;
	}

	/**
	 * An alternative configuration for workspaces.
	 */
	export interface WorkspaceConfig {
		/** An array of workspace pattern strings which contain the workspace packages. */
		packages?: WorkspacePattern[];
		/**
		 * Designed to solve the problem of packages which break when their `node_modules`
		 * are moved to the root workspace directory - a process known as hoisting.
		 *
		 * @see {@link https://classic.yarnpkg.com/blog/2018/02/15/nohoist/ | Yarn nohoist}
		 */
		nohoist?: WorkspacePattern[];
	}

	/**
	 * A workspace pattern points to a directory or group of directories which
	 * contain packages that should be included in the workspace installation process.
	 *
	 * @example
	 * `docs` - Include the docs directory and install its dependencies.
	 *
	 * @example
	 * `packages/*` - Include all nested directories within the packages directory.
	 */
	export type WorkspacePattern = string;

	/**
	 * Yarn-specific configuration fields.
	 */
	export interface YarnConfiguration {
		/**
		 * If your package only allows one version of a given dependency, and you'd like
		 * to enforce the same behavior as `yarn install --flat` on the command-line,
		 * set this to `true`.
		 */
		flat?: boolean;
		/** Selective version resolutions. Allows the definition of custom package versions inside dependencies. */
		resolutions?: Dependency;
	}

	/**
	 * JSPM-specific configuration fields.
	 */
	export interface JSPMConfiguration {
		/** JSPM configuration. */
		jspm?: PackageJson;
	}

	/**
	 * Publish configuration options.
	 */
	export interface PublishConfig {
		/** Additional properties from the npm docs on `publishConfig`. */
		[additionalProperties: string]: JsonValue | undefined;
		/**
		 * When publishing scoped packages, the access level defaults to restricted.
		 * If you want your scoped package to be publicly viewable set `--access=public`.
		 */
		access?: "public" | "restricted";
		/**
		 * The base URL of the npm registry.
		 *
		 * @defaultValue `'https://registry.npmjs.org/'`
		 */
		registry?: string;
		/**
		 * The tag to publish the package under.
		 *
		 * @defaultValue `'latest'`
		 */
		tag?: string;
	}

	/**
	 * Type for npm's `package.json` file containing standard npm properties.
	 *
	 * @see {@link https://docs.npmjs.com/creating-a-package-json-file | npm docs}
	 */
	export interface PackageJsonStandard {
		/** The name of the package. */
		name?: string;
		/** Package version, parseable by `node-semver`. */
		version?: string;
		/** Package description, listed in `npm search`. */
		description?: string;
		/** Keywords associated with package, listed in `npm search`. */
		keywords?: string[];
		/** The URL to the package's homepage. */
		homepage?: LiteralUnion<".", string>;
		/** The URL to the package's issue tracker and/or the email address to which issues should be reported. */
		bugs?: BugsLocation;
		/** The license for the package. */
		license?: string;
		/** The licenses for the package. */
		licenses?: Array<{
			type?: string;
			url?: string;
		}>;
		/** The author of the package. */
		author?: Person;
		/** A list of people who contributed to the package. */
		contributors?: Person[];
		/** A list of people who maintain the package. */
		maintainers?: Person[];
		/** The files included in the package. */
		files?: string[];
		/**
		 * Resolution algorithm for importing ".js" files from the package's scope.
		 *
		 * @see {@link https://nodejs.org/api/esm.html#esm_package_json_type_field | Node.js ESM docs}
		 */
		type?: "module" | "commonjs";
		/** The module ID that is the primary entry point to the program. */
		main?: string;
		/**
		 * Subpath exports to define entry points of the package.
		 *
		 * @see {@link https://nodejs.org/api/packages.html#subpath-exports | Node.js Subpath exports}
		 */
		exports?: Exports;
		/**
		 * Subpath imports to define internal package import maps.
		 *
		 * @see {@link https://nodejs.org/api/packages.html#subpath-imports | Node.js Subpath imports}
		 */
		imports?: Imports;
		/** The executable files that should be installed into the `PATH`. */
		bin?: string | Partial<Record<string, string>>;
		/** Filenames to put in place for the `man` program to find. */
		man?: string | string[];
		/** Indicates the structure of the package. */
		directories?: DirectoryLocations;
		/** Location for the code repository. */
		repository?:
			| string
			| {
					type: string;
					url: string;
					/** Relative path to package.json if it is placed in non-root directory (for monorepos). */
					directory?: string;
			  };
		/** Script commands that are run at various times in the lifecycle of the package. */
		scripts?: Scripts;
		/** Is used to set configuration parameters used in package scripts that persist across upgrades. */
		config?: JsonObject;
		/** The dependencies of the package. */
		dependencies?: Dependency;
		/** Additional tooling dependencies that are not required for the package to work. */
		devDependencies?: Dependency;
		/** Dependencies that are skipped if they fail to install. */
		optionalDependencies?: Dependency;
		/** Dependencies that will usually be required by the package user directly or via another dependency. */
		peerDependencies?: Dependency;
		/** Indicate peer dependencies that are optional. */
		peerDependenciesMeta?: Partial<Record<string, { optional: true }>>;
		/** Package names that are bundled when the package is published. */
		bundledDependencies?: string[];
		/** Alias of `bundledDependencies`. */
		bundleDependencies?: string[];
		/** Overrides is used to support selective version overrides using npm. */
		overrides?: DependencyOverrides;
		/** Engines that this package runs on. */
		engines?: {
			[EngineName in "npm" | "node" | string]?: string;
		};
		/**
		 * Whether to enforce engine requirements strictly.
		 *
		 * @deprecated This field is no longer used by npm. Use the `engine-strict` npm config instead.
		 */
		engineStrict?: boolean;
		/** Operating systems the module runs on. */
		os?: Array<
			LiteralUnion<
				| "aix"
				| "darwin"
				| "freebsd"
				| "linux"
				| "openbsd"
				| "sunos"
				| "win32"
				| "!aix"
				| "!darwin"
				| "!freebsd"
				| "!linux"
				| "!openbsd"
				| "!sunos"
				| "!win32",
				string
			>
		>;
		/** CPU architectures the module runs on. */
		cpu?: Array<
			LiteralUnion<
				| "arm"
				| "arm64"
				| "ia32"
				| "mips"
				| "mipsel"
				| "ppc"
				| "ppc64"
				| "s390"
				| "s390x"
				| "x32"
				| "x64"
				| "!arm"
				| "!arm64"
				| "!ia32"
				| "!mips"
				| "!mipsel"
				| "!ppc"
				| "!ppc64"
				| "!s390"
				| "!s390x"
				| "!x32"
				| "!x64",
				string
			>
		>;
		/** Define the runtime and package manager for developing the current project. */
		devEngines?: {
			os?: DevEngineDependency | DevEngineDependency[];
			cpu?: DevEngineDependency | DevEngineDependency[];
			libc?: DevEngineDependency | DevEngineDependency[];
			runtime?: DevEngineDependency | DevEngineDependency[];
			packageManager?: DevEngineDependency | DevEngineDependency[];
		};
		/**
		 * If set to `true`, a warning will be shown if package is installed locally.
		 *
		 * @deprecated This field is no longer used by npm. Use the `bin` field to create CLI tools instead.
		 */
		preferGlobal?: boolean;
		/** If set to `true`, then npm will refuse to publish it. */
		private?: boolean;
		/** A set of config values that will be used at publish-time. */
		publishConfig?: PublishConfig;
		/**
		 * Describes and notifies consumers of a package's monetary support information.
		 *
		 * @see {@link https://github.com/npm/rfcs/blob/main/implemented/0017-add-funding-support.md | npm funding RFC}
		 */
		funding?:
			| string
			| {
					/** The type of funding. */
					type?: LiteralUnion<
						"github" | "opencollective" | "patreon" | "individual" | "foundation" | "corporation",
						string
					>;
					/** The URL to the funding page. */
					url: string;
			  };
		/**
		 * Used to configure npm workspaces / Yarn workspaces.
		 *
		 * @remarks
		 * Workspaces allow you to manage multiple packages within the same repository
		 * in such a way that you only need to run your install command once in order
		 * to install all of them in a single pass.
		 *
		 * Please note that the top-level `private` property of `package.json` must
		 * be set to `true` in order to use workspaces.
		 *
		 * @see {@link https://docs.npmjs.com/cli/using-npm/workspaces | npm workspaces}
		 * @see {@link https://classic.yarnpkg.com/docs/workspaces/ | Yarn workspaces}
		 */
		workspaces?: WorkspacePattern[] | WorkspaceConfig;
	}

	/**
	 * Type for `package.json` file used by the Node.js runtime.
	 *
	 * @see {@link https://nodejs.org/api/packages.html#nodejs-packagejson-field-definitions | Node.js docs}
	 */
	export interface NodeJsStandard {
		/**
		 * Defines which package manager is expected to be used when working on the current project.
		 *
		 * @remarks
		 * It can be set to any of the supported package managers, and will ensure that
		 * your teams use the exact same package manager versions without having to
		 * install anything else other than Node.js.
		 *
		 * This field is currently experimental and needs to be opted-in; check the
		 * Corepack page for details about the procedure.
		 *
		 * @example
		 * ```json
		 * {
		 *   "packageManager": "pnpm@8.0.0"
		 * }
		 * ```
		 *
		 * @see {@link https://nodejs.org/api/corepack.html | Node.js Corepack docs}
		 */
		packageManager?: string;
	}
}

/**
 * Type for npm's `package.json` file.
 *
 * @remarks
 * Also includes types for fields used by other popular projects, like TypeScript and Yarn.
 *
 * @see {@link https://docs.npmjs.com/creating-a-package-json-file | npm docs}
 *
 * @public
 */
export type PackageJson = JsonObject &
	PackageJson.NodeJsStandard &
	PackageJson.PackageJsonStandard &
	PackageJson.NonStandardEntryPoints &
	PackageJson.TypeScriptConfiguration &
	PackageJson.YarnConfiguration &
	PackageJson.JSPMConfiguration;
