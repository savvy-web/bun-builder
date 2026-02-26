/**
 * Catalog resolver for Bun's `catalog:` and `workspace:` protocols.
 *
 * @remarks
 * This module resolves Bun-specific dependency version references to concrete
 * version strings suitable for npm publishing. Bun workspaces support centralized
 * version catalogs for consistent dependency management across packages.
 *
 * ## Catalog Format
 *
 * Catalogs are defined in the workspace root package.json under the `workspaces` field:
 *
 * ```json
 * {
 *   "workspaces": {
 *     "packages": ["packages/*"],
 *     "catalog": {
 *       "react": "^19.0.0"
 *     },
 *     "catalogs": {
 *       "testing": {
 *         "vitest": "^4.0.0"
 *       }
 *     }
 *   }
 * }
 * ```
 *
 * ## Reference Protocols
 *
 * - `catalog:` - References the default catalog
 * - `catalog:<name>` - References a named catalog
 * - `workspace:*` - References a local workspace package version
 *
 * @example
 * Package.json with catalog references:
 * ```json
 * {
 *   "dependencies": {
 *     "react": "catalog:",
 *     "vitest": "catalog:testing"
 *   }
 * }
 * ```
 *
 */

import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { PackageJson } from "../../types/package-json.js";
import { BuildLogger } from "./logger.js";

/**
 * Workspace configuration structure for Bun workspaces.
 *
 * @internal
 */
interface BunWorkspaceConfig {
	/** Array of glob patterns pointing to workspace packages */
	packages?: string[];
	/** Default catalog for dependencies (accessed via `catalog:`) */
	catalog?: Record<string, string>;
	/** Named catalogs for dependencies (accessed via `catalog:<name>`) */
	catalogs?: Record<string, Record<string, string>>;
}

/**
 * Root package.json with Bun workspace configuration.
 *
 * @remarks
 * We don't extend PackageJson here to avoid index signature conflicts.
 *
 * @internal
 */
interface RootPackageJson {
	name?: string;
	version?: string;
	workspaces?: string[] | BunWorkspaceConfig;
}

/**
 * Manages Bun catalog resolution with caching.
 *
 * @remarks
 * This class handles the resolution of Bun-specific dependency references:
 *
 * - `catalog:` - References to the default centralized version catalog
 * - `catalog:<name>` - References to named catalogs
 * - `workspace:*` - References to local workspace packages
 *
 * The resolver caches catalog data and invalidates automatically when the
 * root package.json is modified.
 *
 * @example
 * Using the shared default instance:
 * ```typescript
 * import type { PackageJson } from '@savvy-web/bun-builder';
 * import { BunCatalogResolver } from '@savvy-web/bun-builder';
 *
 * const resolver = BunCatalogResolver.getDefault();
 *
 * const packageJson: PackageJson = {
 *   dependencies: { 'react': 'catalog:' },
 * };
 *
 * const resolved = await resolver.resolvePackageJson(packageJson);
 * // resolved.dependencies.react = "^19.0.0" (from catalog)
 * ```
 *
 * @example
 * Creating a new instance for isolated testing:
 * ```typescript
 * import { BunCatalogResolver } from '@savvy-web/bun-builder';
 *
 * const resolver = new BunCatalogResolver();
 * resolver.clearCache(); // Fresh cache for this instance
 * ```
 *
 * @internal
 */
export class BunCatalogResolver {
	/**
	 * Prefix for catalog protocol references.
	 * @internal
	 */
	private static readonly CATALOG_PREFIX = "catalog:";

	/**
	 * Prefix for workspace protocol references.
	 * @internal
	 */
	private static readonly WORKSPACE_PREFIX = "workspace:";

	/**
	 * Singleton instance for the default resolver.
	 *
	 * @internal
	 */
	private static defaultInstance: BunCatalogResolver | null = null;

	/**
	 * Gets the default BunCatalogResolver singleton instance.
	 *
	 * @remarks
	 * Returns a shared resolver instance that caches catalog data
	 * for improved performance across multiple resolution calls.
	 * Use this for normal operations; create a new instance only
	 * when isolated caching is needed (e.g., in tests).
	 *
	 * @returns The default BunCatalogResolver instance
	 *
	 * @example
	 * ```typescript
	 * import { BunCatalogResolver } from '@savvy-web/bun-builder';
	 *
	 * const resolver = BunCatalogResolver.getDefault();
	 * const catalogs = await resolver.getCatalogs();
	 * ```
	 *
	 */
	static getDefault(): BunCatalogResolver {
		if (!BunCatalogResolver.defaultInstance) {
			BunCatalogResolver.defaultInstance = new BunCatalogResolver();
		}
		return BunCatalogResolver.defaultInstance;
	}
	/**
	 * Cached catalog data.
	 *
	 * @internal
	 */
	private catalogCache: {
		default: Record<string, string>;
		named: Record<string, Record<string, string>>;
	} | null = null;

	/**
	 * Modification time of the cached root package.json.
	 *
	 * @internal
	 */
	private catalogCacheMtime: number | null = null;

	/**
	 * Path to the cached workspace root.
	 *
	 * @internal
	 */
	private cachedRootPath: string | null = null;

	/**
	 * Clears the cached catalog data.
	 *
	 * @remarks
	 * Call this to force re-reading catalogs from disk on the next resolution.
	 */
	clearCache(): void {
		this.catalogCache = null;
		this.catalogCacheMtime = null;
		this.cachedRootPath = null;
	}

	/**
	 * Finds the workspace root by looking for a package.json with workspaces field.
	 *
	 * @param startDir - Directory to start searching from
	 * @returns Absolute path to workspace root, or `null` if not found
	 */
	findWorkspaceRoot(startDir: string = process.cwd()): string | null {
		let currentDir = resolve(startDir);
		const root = dirname(currentDir);

		while (currentDir !== root) {
			const packageJsonPath = join(currentDir, "package.json");
			try {
				const content = readFileSync(packageJsonPath, "utf-8");
				const pkg = JSON.parse(content) as RootPackageJson;

				// Check if this package.json has workspaces field
				if (pkg.workspaces) {
					return currentDir;
				}
			} catch {
				// No package.json or can't read it, continue up
			}

			currentDir = dirname(currentDir);
		}

		return null;
	}

	/**
	 * Gets the Bun catalogs from the workspace root package.json.
	 *
	 * @remarks
	 * Results are cached and automatically invalidated when the root
	 * package.json is modified.
	 *
	 * @param workspaceRoot - Optional workspace root path (auto-detected if not provided)
	 * @returns Object containing default and named catalogs
	 */
	async getCatalogs(workspaceRoot?: string): Promise<{
		default: Record<string, string>;
		named: Record<string, Record<string, string>>;
	}> {
		const root = workspaceRoot ?? this.findWorkspaceRoot();
		if (!root) {
			return { default: {}, named: {} };
		}

		const packageJsonPath = join(root, "package.json");

		try {
			const stats = statSync(packageJsonPath);
			const currentMtime = stats.mtime.getTime();

			// Return cached if unchanged
			if (this.catalogCache && this.catalogCacheMtime === currentMtime && this.cachedRootPath === root) {
				return this.catalogCache;
			}

			const content = readFileSync(packageJsonPath, "utf-8");
			const pkg = JSON.parse(content) as RootPackageJson;

			let workspaceConfig: BunWorkspaceConfig = {};
			if (Array.isArray(pkg.workspaces)) {
				// Simple array format - no catalogs
				workspaceConfig = {};
			} else if (pkg.workspaces && typeof pkg.workspaces === "object") {
				workspaceConfig = pkg.workspaces;
			}

			this.catalogCache = {
				default: workspaceConfig.catalog ?? {},
				named: workspaceConfig.catalogs ?? {},
			};
			this.catalogCacheMtime = currentMtime;
			this.cachedRootPath = root;

			return this.catalogCache;
		} catch (error) {
			const logger = BuildLogger.createLogger("catalog");
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error(`Failed to read workspace package.json: ${errorMessage}`);
			return { default: {}, named: {} };
		}
	}

	/**
	 * Resolves a catalog: reference to an actual version.
	 *
	 * @param reference - The reference string (e.g., "catalog:", "catalog:testing")
	 * @param packageName - The package name being resolved
	 * @returns The resolved version or null if not found
	 */
	async resolveReference(reference: string, packageName: string): Promise<string | null> {
		if (!reference.startsWith(BunCatalogResolver.CATALOG_PREFIX)) {
			return null;
		}

		const catalogs = await this.getCatalogs();
		const catalogName = reference.slice(BunCatalogResolver.CATALOG_PREFIX.length);

		if (!catalogName || catalogName === "") {
			// Default catalog
			return catalogs.default[packageName] ?? null;
		}

		// Named catalog
		const namedCatalog = catalogs.named[catalogName];
		return namedCatalog?.[packageName] ?? null;
	}

	/**
	 * Resolves all catalog: and workspace: references in a package.json.
	 *
	 * @param packageJson - The package.json to resolve
	 * @param dir - The directory containing the package
	 * @returns The resolved package.json
	 */
	async resolvePackageJson(packageJson: PackageJson, dir: string = process.cwd()): Promise<PackageJson> {
		const logger = BuildLogger.createLogger("catalog");
		const result = { ...packageJson };

		const dependencyFields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;

		const workspaceRoot = this.findWorkspaceRoot(dir);

		let catalogCount = 0;
		let workspaceCount = 0;

		for (const field of dependencyFields) {
			const deps = result[field];
			if (!deps || typeof deps !== "object") continue;

			const resolvedDeps: Record<string, string> = {};

			for (const [name, version] of Object.entries(deps)) {
				if (typeof version !== "string") {
					// Skip non-string values (shouldn't happen in valid package.json)
					continue;
				}

				if (version.startsWith(BunCatalogResolver.CATALOG_PREFIX)) {
					const resolved = await this.resolveReference(version, name);
					if (resolved) {
						resolvedDeps[name] = resolved;
						catalogCount++;
					} else {
						// Log error but keep original reference
						logger.error(`Failed to resolve ${version} for ${name} - not found in catalog`);
						resolvedDeps[name] = version;
					}
				} else if (version.startsWith(BunCatalogResolver.WORKSPACE_PREFIX)) {
					// workspace:* -> resolve to actual version from the workspace package
					// For now, we'll resolve workspace:* to the version from the local package
					// In a real implementation, you'd look up the version from the workspace package
					const workspaceVersion = await this.resolveWorkspaceVersion(name, workspaceRoot);
					if (workspaceVersion) {
						resolvedDeps[name] = workspaceVersion;
						workspaceCount++;
					} else {
						// Keep as-is if we can't resolve (might be intentional)
						resolvedDeps[name] = version;
						workspaceCount++;
					}
				} else {
					resolvedDeps[name] = version;
				}
			}

			(result as Record<string, unknown>)[field] = resolvedDeps;
		}

		if (catalogCount > 0) {
			logger.info(`Resolved ${catalogCount} catalog: references`);
		}
		if (workspaceCount > 0) {
			logger.info(`Resolved ${workspaceCount} workspace: references`);
		}

		// Validate no unresolved references remain
		this.validateNoUnresolvedReferences(result, logger);

		return result;
	}

	/**
	 * Resolves a workspace: reference to an actual version.
	 *
	 * @remarks
	 * Attempts to find the package in common workspace locations and read its version.
	 * This is a simplified implementation that checks `packages/<name>` and `<name>`
	 * directories.
	 *
	 * @param packageName - Name of the workspace package
	 * @param workspaceRoot - Path to the workspace root
	 * @returns The package version, or `null` if not found
	 *
	 * @internal
	 */
	private async resolveWorkspaceVersion(packageName: string, workspaceRoot: string | null): Promise<string | null> {
		/* v8 ignore start -- @preserve */
		if (!workspaceRoot) return null;

		// Try to find the package in the workspace
		// This is a simplified implementation - in reality you'd parse the workspaces
		// config and find the actual package
		const possiblePaths = [
			join(workspaceRoot, "packages", packageName, "package.json"),
			join(workspaceRoot, packageName, "package.json"),
		];

		for (const pkgPath of possiblePaths) {
			try {
				const content = readFileSync(pkgPath, "utf-8");
				const pkg = JSON.parse(content) as PackageJson;
				if (pkg.version) {
					return pkg.version;
				}
			} catch {
				// Package not found at this path, try next
			}
		}

		return null;
		/* v8 ignore stop */
	}

	/**
	 * Validates that no unresolved catalog: or workspace: references remain.
	 *
	 * @remarks
	 * Throws an error if any references could not be resolved, as publishing
	 * a package with unresolved references would result in an invalid package.
	 *
	 * @param packageJson - The resolved package.json to validate
	 * @param logger - Logger for error reporting
	 * @throws Error if unresolved references are found
	 *
	 * @internal
	 */
	private validateNoUnresolvedReferences(
		packageJson: PackageJson,
		logger: ReturnType<typeof BuildLogger.createLogger>,
	): void {
		const dependencyFields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;

		const unresolved: Array<{ field: string; name: string; version: string }> = [];

		for (const field of dependencyFields) {
			const deps = packageJson[field];
			if (!deps || typeof deps !== "object") continue;

			for (const [name, version] of Object.entries(deps)) {
				if (
					typeof version === "string" &&
					(version.startsWith(BunCatalogResolver.CATALOG_PREFIX) ||
						version.startsWith(BunCatalogResolver.WORKSPACE_PREFIX))
				) {
					unresolved.push({ field, name, version });
				}
			}
		}

		if (unresolved.length > 0) {
			logger.error("Unresolved references remain in package.json:");
			for (const { field, name, version } of unresolved) {
				logger.error(`  - ${field}.${name}: ${version}`);
			}
			throw new Error(`${unresolved.length} unresolved references would result in invalid package.json`);
		}
	}
}
