/**
 * E2E test utility for building fixture packages.
 *
 * Copies a fixture to a temp directory, runs the build, and collects outputs.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import type { BuildMode } from "../../../src/types/builder-types.js";

/** Result of building a fixture. */
export interface BuildFixtureResult {
	/** Whether the build process exited successfully. */
	exitCode: number;
	/** Stdout from the build. */
	stdout: string;
	/** Stderr from the build. */
	stderr: string;
	/** The temporary directory where the fixture was copied. */
	tempDir: string;
	/** The output directory (dist/{mode}). */
	outdir: string;
	/** All files in the output directory, relative to outdir. */
	outputFiles: string[];
	/** Cleanup function to remove the temp directory. */
	cleanup: () => void;
}

/** Options for buildFixture. */
export interface BuildFixtureOptions {
	/** Path to the fixture directory (relative to project root or absolute). */
	fixture: string;
	/** Build mode. */
	mode: BuildMode;
	/** Extra builder options to pass to BunLibraryBuilder.create(). */
	builderOptions?: string;
}

/**
 * Builds a fixture package in an isolated temp directory.
 *
 * @param options - Build options
 * @returns Build result with outputs and cleanup
 */
export async function buildFixture(options: BuildFixtureOptions): Promise<BuildFixtureResult> {
	const { fixture, mode, builderOptions } = options;

	const projectRoot = resolve(import.meta.dir, "../../..");
	const fixtureDir = resolve(projectRoot, fixture);

	// Create temp dir with UUID isolation
	const tempDir = join(projectRoot, ".bun-builder", "e2e-temp", crypto.randomUUID());
	mkdirSync(tempDir, { recursive: true });

	try {
		// Copy fixture to temp dir
		cpSync(fixtureDir, tempDir, { recursive: true });

		// Symlink node_modules from project root so dependencies are available
		const nodeModulesTarget = join(projectRoot, "node_modules");
		const nodeModulesLink = join(tempDir, "node_modules");
		if (!existsSync(nodeModulesLink)) {
			symlinkSync(nodeModulesTarget, nodeModulesLink, "dir");
		}

		// Generate bun.config.ts with a relative import path back to the project source
		const builderSourcePath = join(projectRoot, "src", "index.ts");
		const configContent = generateBunConfig(builderSourcePath, builderOptions);
		Bun.write(join(tempDir, "bun.config.ts"), configContent);

		// Run the build with a clean environment
		const { BUN_BUILDER_LOCAL_PATHS: _, ...cleanEnv } = process.env;
		const proc = Bun.spawn(["bun", "run", "bun.config.ts", "--env-mode", mode], {
			cwd: tempDir,
			env: {
				...cleanEnv,
				NODE_ENV: "production",
				// Prevent local path validation from failing in test environments
				CI: "true",
			},
			stdout: "pipe",
			stderr: "pipe",
		});

		const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);

		const exitCode = await proc.exited;

		// Collect output files
		const outdir = join(tempDir, "dist", mode);
		const outputFiles = existsSync(outdir) ? collectFiles(outdir, outdir) : [];

		return {
			exitCode,
			stdout,
			stderr,
			tempDir,
			outdir,
			outputFiles,
			cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
		};
	} catch (error) {
		// Cleanup on failure
		rmSync(tempDir, { recursive: true, force: true });
		throw error;
	}
}

/**
 * Generate a bun.config.ts for the fixture with an absolute import to bun-builder source.
 */
function generateBunConfig(builderSourcePath: string, builderOptions?: string): string {
	const opts = builderOptions ?? "{}";
	return `import { BunLibraryBuilder } from "${builderSourcePath}";
export default BunLibraryBuilder.create(${opts});
`;
}

/**
 * Recursively collect all files in a directory, returning paths relative to root.
 */
function collectFiles(dir: string, root: string): string[] {
	const files: string[] = [];
	if (!existsSync(dir)) return files;

	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectFiles(fullPath, root));
		} else {
			files.push(relative(root, fullPath));
		}
	}

	return files.sort();
}

/**
 * Read a file from the build output.
 */
export function readOutputFile(result: BuildFixtureResult, filePath: string): string {
	return readFileSync(join(result.outdir, filePath), "utf-8");
}

/**
 * Read the package.json from a specific directory within the temp dir.
 */
export function readPackageJson(result: BuildFixtureResult, dir?: string): Record<string, unknown> {
	const pkgPath = dir ? join(result.tempDir, dir, "package.json") : join(result.outdir, "package.json");
	return JSON.parse(readFileSync(pkgPath, "utf-8"));
}

/**
 * Collect output files from a specific directory within the temp dir.
 */
export function collectOutputFiles(result: BuildFixtureResult, dir: string): string[] {
	const fullDir = join(result.tempDir, dir);
	return existsSync(fullDir) ? collectFiles(fullDir, fullDir) : [];
}

/**
 * Clean up stale temp directories from previous test runs.
 * Removes directories older than 1 hour to prevent accumulation from killed tests.
 */
export function cleanStaleTempDirs(): void {
	const projectRoot = resolve(import.meta.dir, "../../..");
	const tempBase = join(projectRoot, ".bun-builder", "e2e-temp");

	if (!existsSync(tempBase)) return;

	/* v8 ignore start -- cleanup heuristic requires stale dirs to exist */
	const ONE_HOUR = 60 * 60 * 1000;
	const now = Date.now();

	for (const entry of readdirSync(tempBase, { withFileTypes: true })) {
		if (!entry.isDirectory()) continue;
		const dirPath = join(tempBase, entry.name);
		try {
			const stats = statSync(dirPath);
			if (now - stats.mtimeMs > ONE_HOUR) {
				rmSync(dirPath, { recursive: true, force: true });
			}
		} catch {
			// Ignore errors during cleanup
		}
	}
	/* v8 ignore stop */
}
