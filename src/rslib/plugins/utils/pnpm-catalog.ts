import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { createExportableManifest } from "@pnpm/exportable-manifest";
import type { ProjectManifest } from "@pnpm/types";
import type { PackageJson } from "type-fest";
import { getWorkspaceRoot } from "workspace-tools";
import { parse } from "yaml";
import { createEnvLogger } from "./build-logger.js";

/**
 * Configuration structure for pnpm workspace files (pnpm-workspace.yaml).
 */
interface PnpmWorkspace {
	packages?: string[];
	catalog?: Record<string, string>;
	onlyBuiltDependencies?: string[];
	publicHoistPattern?: string[];
}

const CATALOG_PREFIX = "catalog:";
const WORKSPACE_PREFIX = "workspace:";

/**
 * Manages PNPM catalog resolution with caching.
 *
 * @remarks
 * This class handles the resolution of PNPM-specific dependency references:
 * - `catalog:` references to centralized version definitions
 * - `workspace:` references to local workspace packages
 *
 * The class caches the catalog data based on file modification time to avoid
 * repeated filesystem operations during builds.
 *
 * @example
 * ```typescript
 * const catalog = new PnpmCatalog();
 *
 * // Get the catalog data
 * const versions = await catalog.getCatalog();
 * console.log(versions);
 * // { "react": "^18.2.0", "typescript": "^5.0.0" }
 *
 * // Resolve package.json dependencies
 * const resolved = await catalog.resolvePackageJson(packageJson);
 * ```
 *
 * @public
 */
export class PnpmCatalog {
	private catalogCache: Record<string, string> | null = null;
	private catalogCacheMtime: number | null = null;
	private cachedWorkspaceRoot: string | undefined | null = null;

	/**
	 * Clears the cached catalog data.
	 *
	 * @remarks
	 * Useful in testing scenarios to ensure clean state between tests.
	 */
	clearCache(): void {
		this.catalogCache = null;
		this.catalogCacheMtime = null;
		this.cachedWorkspaceRoot = null;
	}

	/**
	 * Gets the PNPM catalog from pnpm-workspace.yaml.
	 *
	 * @remarks
	 * The catalog is cached based on file modification time. If the file hasn't
	 * changed since the last read, the cached version is returned.
	 *
	 * @returns The catalog mapping dependency names to versions
	 */
	async getCatalog(): Promise<Record<string, string>> {
		try {
			if (!this.cachedWorkspaceRoot) {
				this.cachedWorkspaceRoot = getWorkspaceRoot(process.cwd());
				if (!this.cachedWorkspaceRoot) {
					throw new Error("Could not find workspace root - ensure you're in a workspace");
				}
			}

			const workspaceFile = resolve(this.cachedWorkspaceRoot, "pnpm-workspace.yaml");
			const stats = await stat(workspaceFile);
			const currentMtime = stats.mtime.getTime();

			if (this.catalogCache !== null && this.catalogCacheMtime === currentMtime) {
				return this.catalogCache;
			}

			const content = await readFile(workspaceFile, "utf-8");
			const workspace = parse(content) as PnpmWorkspace;
			this.catalogCache = workspace.catalog ?? {};
			this.catalogCacheMtime = currentMtime;
			return this.catalogCache;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const logger = createEnvLogger("catalog");

			if (errorMessage.includes("ENOENT") && errorMessage.includes("pnpm-workspace.yaml")) {
				logger.error("Failed to read pnpm catalog: workspace configuration not found");
				logger.error("  -> Ensure you're in a pnpm workspace with proper configuration");
			} else if (errorMessage.includes("YAML")) {
				logger.error("Failed to read pnpm catalog: Invalid YAML syntax in workspace configuration");
				logger.error("  -> Check workspace configuration file syntax");
			} else {
				logger.error(`Failed to read pnpm catalog from pnpm-workspace.yaml: ${errorMessage}`);
			}

			return {};
		}
	}

	/**
	 * Resolves catalog: and workspace: references in a package.json.
	 *
	 * @param packageJson - The package.json to resolve
	 * @param dir - The directory containing the package (defaults to cwd)
	 * @returns The resolved package.json
	 *
	 * @throws When resolution fails for critical dependencies
	 */
	async resolvePackageJson(packageJson: PackageJson, dir: string = process.cwd()): Promise<PackageJson> {
		const logger = createEnvLogger("pnpm");

		try {
			const catalog = await this.getCatalog();

			// Collect dependencies that need resolution
			const catalogDeps = this.collectDependencies(packageJson, CATALOG_PREFIX);
			const workspaceDeps = this.collectDependencies(packageJson, WORKSPACE_PREFIX);

			const hasCatalogDeps = catalogDeps.length > 0;
			const hasWorkspaceDeps = workspaceDeps.length > 0;

			// Validate catalog availability
			if (hasCatalogDeps && Object.keys(catalog).length === 0) {
				const error = `Package contains ${CATALOG_PREFIX} dependencies but catalog configuration is missing`;
				logger.error(error);
				logger.error("  -> Catalog dependencies found:");
				for (const { field, dependency, version } of catalogDeps) {
					logger.error(`    - ${field}.${dependency}: ${version}`);
				}
				throw new Error(error);
			}

			if (hasCatalogDeps) {
				logger.info(`Resolving ${catalogDeps.length} ${CATALOG_PREFIX} dependencies`);
			}
			if (hasWorkspaceDeps) {
				logger.info(`Resolving ${workspaceDeps.length} ${WORKSPACE_PREFIX} dependencies`);
			}

			const result = await createExportableManifest(dir, packageJson as ProjectManifest, {
				catalogs: { default: catalog },
			});

			// Log resolved dependencies
			if (hasCatalogDeps || hasWorkspaceDeps) {
				this.logResolvedDependencies(result as PackageJson, [...catalogDeps, ...workspaceDeps], logger);
			}

			// Validate no unresolved references remain
			this.validateNoUnresolvedReferences(result as PackageJson, logger);

			return result as PackageJson;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);

			// Re-throw specific validation errors
			if (
				errorMessage.startsWith("Transformation failed:") ||
				errorMessage.includes(`Package contains ${CATALOG_PREFIX} dependencies`)
			) {
				throw error;
			}

			logger.error(`Failed to apply pnpm transformations for directory ${dir}: ${errorMessage}`);

			if (errorMessage.includes("catalog")) {
				logger.error(
					`  -> Catalog resolution failed - check workspace configuration and ${CATALOG_PREFIX} dependencies`,
				);
				throw new Error("Catalog resolution failed");
			}
			if (errorMessage.includes("workspace")) {
				logger.error(`  -> Workspace resolution failed - check ${WORKSPACE_PREFIX} dependencies and configuration`);
				throw new Error("Workspace resolution failed");
			}
			if (errorMessage.includes("manifest")) {
				logger.error("  -> Manifest processing failed - check package.json syntax");
				throw new Error(`Manifest processing failed: ${errorMessage}`);
			}

			logger.error("  -> Cannot proceed with invalid package.json transformations");
			throw new Error(`PNPM transformation failed: ${errorMessage}`);
		}
	}

	/**
	 * Collects dependencies with a specific prefix (catalog: or workspace:).
	 */
	private collectDependencies(
		packageJson: PackageJson,
		prefix: string,
	): Array<{ field: string; dependency: string; version: string }> {
		const deps: Array<{ field: string; dependency: string; version: string }> = [];
		const fields = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const;

		for (const field of fields) {
			const fieldDeps = packageJson[field] as Record<string, string> | undefined;
			if (fieldDeps) {
				for (const [dependency, version] of Object.entries(fieldDeps)) {
					if (typeof version === "string" && version.startsWith(prefix)) {
						deps.push({ field, dependency, version });
					}
				}
			}
		}

		return deps;
	}

	/**
	 * Logs resolved dependencies in a formatted way.
	 */
	private logResolvedDependencies(
		resultPkg: PackageJson,
		originalDeps: Array<{ field: string; dependency: string }>,
		logger: ReturnType<typeof createEnvLogger>,
	): void {
		const allResolved: Record<string, Array<{ dependency: string; version: string }>> = {};

		for (const { field, dependency } of originalDeps) {
			const deps = resultPkg[field as keyof PackageJson] as Record<string, string> | undefined;
			if (deps?.[dependency]) {
				if (!allResolved[field]) {
					allResolved[field] = [];
				}
				allResolved[field].push({ dependency, version: deps[dependency] });
			}
		}

		if (Object.keys(allResolved).length > 0) {
			logger.info("Resolved dependencies:");
			for (const [field, deps] of Object.entries(allResolved)) {
				logger.info(`- ${field}:`);
				for (const { dependency, version } of deps) {
					logger.info(`    ${dependency}: ${version}`);
				}
			}
		}
	}

	/**
	 * Validates that no unresolved catalog: or workspace: references remain.
	 */
	private validateNoUnresolvedReferences(resultPkg: PackageJson, logger: ReturnType<typeof createEnvLogger>): void {
		const unresolvedDeps = [
			...this.collectDependencies(resultPkg, CATALOG_PREFIX),
			...this.collectDependencies(resultPkg, WORKSPACE_PREFIX),
		];

		if (unresolvedDeps.length > 0) {
			const catalogRefs = unresolvedDeps.filter((dep) => dep.version.startsWith(CATALOG_PREFIX));
			const workspaceRefs = unresolvedDeps.filter((dep) => dep.version.startsWith(WORKSPACE_PREFIX));

			const refTypes: string[] = [];
			if (catalogRefs.length > 0) refTypes.push(CATALOG_PREFIX);
			if (workspaceRefs.length > 0) refTypes.push(WORKSPACE_PREFIX);

			const error = `Transformation failed: unresolved ${refTypes.join(" and ")} references remain in package.json`;
			logger.error(error);
			logger.error("  -> This would result in invalid package.json being published to npm");
			logger.error("  -> Unresolved dependencies:");

			for (const { field, dependency, version } of unresolvedDeps) {
				logger.error(`    - ${field}.${dependency}: ${version}`);
			}

			throw new Error(error);
		}
	}
}

// Singleton instance for use by applyPnpmTransformations
let defaultInstance: PnpmCatalog | null = null;

/**
 * Gets the default PnpmCatalog singleton instance.
 *
 * @remarks
 * Used internally by applyPnpmTransformations to maintain a single
 * cached instance across builds.
 *
 * @internal
 */
export function getDefaultPnpmCatalog(): PnpmCatalog {
	if (!defaultInstance) {
		defaultInstance = new PnpmCatalog();
	}
	return defaultInstance;
}
