/**
 * Logging utilities for the Bun Library Builder.
 *
 * @remarks
 * Provides RSlib-style logging with colored prefixes and formatted output.
 * All logging is automatically suppressed in test environments to keep
 * test output clean.
 *
 * The module provides the {@link BuildLogger} class for all logging operations,
 * including environment detection, timing, formatting, and file table display.
 *
 */

import { stat } from "node:fs/promises";
import { join, relative } from "node:path";
import colors from "picocolors";

// Extract color functions from picocolors for consistent coloring
const cyan: typeof colors.cyan = colors.cyan;
const dim: typeof colors.dim = colors.dim;
const bold: typeof colors.bold = colors.bold;
const red: typeof colors.red = colors.red;
const yellow: typeof colors.yellow = colors.yellow;
const green: typeof colors.green = colors.green;
const magenta: typeof colors.magenta = colors.magenta;

/**
 * Timer interface for measuring execution time.
 *
 * @internal
 */
export interface Timer {
	/**
	 * Returns elapsed time in milliseconds since timer creation.
	 */
	elapsed: () => number;

	/**
	 * Returns formatted elapsed time string.
	 */
	format: () => string;
}

/**
 * Logger interface for build operations.
 *
 * @remarks
 * Provides standard logging methods with consistent formatting.
 * All methods are automatically suppressed in test environments.
 *
 * @internal
 */
export interface Logger {
	/**
	 * Logs an informational message.
	 */
	info: (message: string) => void;

	/**
	 * Logs a warning message.
	 */
	warn: (message: string) => void;

	/**
	 * Logs an error message.
	 */
	error: (message: string) => void;

	/**
	 * Logs a success message with optional filename highlight.
	 */
	success: (message: string, filename?: string) => void;

	/**
	 * Logs a ready/completion message.
	 */
	ready: (message: string) => void;
}

/**
 * Extended logger interface with environment context.
 *
 * @remarks
 * Provides environment-aware logging with build target context.
 * Includes additional methods for logging file operations and entry points.
 *
 * @internal
 */
export interface EnvLogger extends Logger {
	/**
	 * Logger for messages without environment tag prefix.
	 */
	global: Logger;

	/**
	 * Logs a file operation with a list of affected files.
	 */
	fileOp: (message: string, files: string[]) => void;

	/**
	 * Logs entry point mappings.
	 */
	entries: (message: string, entries: Record<string, string>) => void;
}

/**
 * File entry for the file table display.
 *
 * @internal
 */
export interface FileEntry {
	/**
	 * File path (typically relative to output directory).
	 */
	path: string;

	/**
	 * File size in bytes.
	 */
	size: number;
}

/**
 * Centralized logging and formatting utilities for the build system.
 *
 * @remarks
 * This class provides static methods for all logging and formatting operations
 * needed during the build process. It handles:
 *
 * - Environment detection (CI, test environments)
 * - Time and size formatting
 * - Timer creation for performance measurement
 * - Logger creation (basic and environment-aware)
 * - File information collection
 * - Banner and summary printing
 * - File table display
 *
 * All output is automatically suppressed in test environments.
 *
 * @example
 * Environment detection and formatting:
 * ```typescript
 * import { BuildLogger } from '@savvy-web/bun-builder';
 *
 * if (BuildLogger.isCI()) {
 *   console.log('Running in CI environment');
 * }
 *
 * const timer = BuildLogger.createTimer();
 * // ... perform operation
 * console.log(`Completed in ${BuildLogger.formatTime(timer.elapsed())}`);
 * console.log(`File size: ${BuildLogger.formatSize(1024)}`);
 * ```
 *
 * @example
 * Creating and using loggers:
 * ```typescript
 * import { BuildLogger } from '@savvy-web/bun-builder';
 *
 * // Basic logger with prefix
 * const logger = BuildLogger.createLogger('my-plugin');
 * logger.info('Starting...');
 * // Output: info    [my-plugin] Starting...
 *
 * // Environment-aware logger
 * const envLogger = BuildLogger.createEnvLogger('npm');
 * envLogger.info('Building...');
 * // Output: info    [npm] Building...
 * ```
 *
 * @internal
 */
// biome-ignore lint/complexity/noStaticOnlyClass: Intentional static-only class for API organization
export class BuildLogger {
	/**
	 * Prefix width to match RSlib-style output.
	 */
	private static readonly PREFIX_WIDTH = 8;

	/**
	 * Determines if the current process is running in a CI environment.
	 *
	 * @remarks
	 * Checks for common CI environment indicators:
	 * - `CI=true`
	 * - `GITHUB_ACTIONS=true`
	 *
	 * @returns `true` if running in CI
	 *
	 * @example
	 * ```typescript
	 * import { BuildLogger } from '@savvy-web/bun-builder';
	 *
	 * if (BuildLogger.isCI()) {
	 *   // Use stricter error handling in CI
	 * }
	 * ```
	 */
	static isCI(): boolean {
		return process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
	}

	/**
	 * Determines if the current process is running in a test environment.
	 *
	 * @remarks
	 * Checks for common test environment indicators:
	 * - `NODE_ENV=test`
	 * - `VITEST=true`
	 * - `JEST_WORKER_ID` environment variable
	 * - Test runner names in process arguments
	 * - Test file patterns in arguments (`.test.ts`, `.test.js`, `.spec.ts`, `.spec.js`)
	 *
	 * @returns `true` if running in a test environment
	 */
	static isTestEnvironment(): boolean {
		// Check common test environment variables
		if (process.env.NODE_ENV === "test" || process.env.VITEST === "true" || process.env.JEST_WORKER_ID !== undefined) {
			return true;
		}

		// Check for test runners in argv
		const hasTestRunner = process.argv.some(
			(arg) => arg.includes("vitest") || arg.includes("jest") || arg.includes(":bun-test"),
		);
		if (hasTestRunner) {
			return true;
		}

		// Check for test file patterns in argv (bun test passes file paths directly)
		const hasTestFile = process.argv.some(
			(arg) =>
				arg.endsWith(".test.ts") || arg.endsWith(".test.js") || arg.endsWith(".spec.ts") || arg.endsWith(".spec.js"),
		);
		if (hasTestFile) {
			return true;
		}

		return false;
	}

	/**
	 * Formats elapsed time in milliseconds to a human-readable string.
	 *
	 * @param ms - The time duration in milliseconds
	 * @returns A formatted string (e.g., `"150ms"` or `"2.50 s"`)
	 *
	 * @example
	 * ```typescript
	 * import { BuildLogger } from '@savvy-web/bun-builder';
	 *
	 * BuildLogger.formatTime(150);   // "150ms"
	 * BuildLogger.formatTime(2500);  // "2.50 s"
	 * ```
	 */
	static formatTime(ms: number): string {
		if (ms < 1000) {
			return `${ms}ms`;
		}
		return `${(ms / 1000).toFixed(2)} s`;
	}

	/**
	 * Formats a file size in bytes to a human-readable string.
	 *
	 * @param bytes - The size in bytes
	 * @returns A formatted string (e.g., `"512 B"` or `"1.50 kB"`)
	 *
	 * @example
	 * ```typescript
	 * import { BuildLogger } from '@savvy-web/bun-builder';
	 *
	 * BuildLogger.formatSize(512);   // "512 B"
	 * BuildLogger.formatSize(1536);  // "1.50 kB"
	 * ```
	 */
	static formatSize(bytes: number): string {
		if (bytes < 1024) {
			return `${bytes} B`;
		}
		return `${(bytes / 1024).toFixed(2)} kB`;
	}

	/**
	 * Creates a timer for measuring execution time.
	 *
	 * @returns A timer object with methods to measure and format elapsed time
	 *
	 * @example
	 * ```typescript
	 * import { BuildLogger } from '@savvy-web/bun-builder';
	 *
	 * const timer = BuildLogger.createTimer();
	 * // ... perform operation
	 * console.log(`Completed in ${timer.format()}`);
	 * ```
	 */
	static createTimer(): Timer {
		const start = Date.now();
		return {
			elapsed: () => Date.now() - start,
			format: () => BuildLogger.formatTime(Date.now() - start),
		};
	}

	/**
	 * Creates a styled prefix like RSlib's logger.
	 *
	 * @param label - The label text (e.g., "info", "warn")
	 * @param color - Coloring function from picocolors
	 * @returns Styled prefix string
	 */
	private static createPrefix(label: string, color: (s: string) => string): string {
		const padded = label.padEnd(BuildLogger.PREFIX_WIDTH);
		return color(padded);
	}

	/**
	 * Creates a logger with a bracketed prefix.
	 *
	 * @remarks
	 * The logger displays messages in RSlib style:
	 * ```text
	 * info    [tsdoc-lint] Validating TSDoc comments...
	 * ```
	 *
	 * All output is suppressed in test environments.
	 *
	 * @param prefix - The prefix to display in brackets (e.g., `"tsdoc-lint"`)
	 * @returns A Logger instance with the specified prefix
	 *
	 * @example
	 * ```typescript
	 * import { BuildLogger } from '@savvy-web/bun-builder';
	 *
	 * const logger = BuildLogger.createLogger('my-plugin');
	 * logger.info('Starting...');
	 * // Output: info    [my-plugin] Starting...
	 * ```
	 */
	static createLogger(prefix: string): Logger {
		const isTest = BuildLogger.isTestEnvironment();
		const prefixStr = dim(`[${prefix}]`);

		return {
			info: (message: string): void => {
				if (!isTest) {
					console.log(`${BuildLogger.createPrefix("info", cyan)}${prefixStr} ${message}`);
				}
			},
			warn: (message: string): void => {
				if (!isTest) {
					console.log(`${BuildLogger.createPrefix("warn", yellow)}${prefixStr} ${message}`);
				}
			},
			error: (message: string): void => {
				if (!isTest) {
					console.log(`${BuildLogger.createPrefix("error", red)}${prefixStr} ${message}`);
				}
			},
			success: (message: string): void => {
				if (!isTest) {
					console.log(`${BuildLogger.createPrefix("info", cyan)}${prefixStr} ${green(message)}`);
				}
			},
			ready: (message: string): void => {
				if (!isTest) {
					console.log(`${BuildLogger.createPrefix("ready", green)}${prefixStr} ${message}`);
				}
			},
		};
	}

	/**
	 * Creates an environment-aware logger with RSlib-style formatting.
	 *
	 * @remarks
	 * The logger displays messages with a build target tag:
	 * ```text
	 * info    [dev] build started...
	 * info    [npm] Bundled 3 file(s) in 150ms
	 * ```
	 *
	 * Includes additional methods for logging file operations and entries,
	 * plus a `global` sub-logger for messages without the environment tag.
	 *
	 * @param envId - The environment/target identifier (e.g., `"dev"`, `"npm"`)
	 * @returns An EnvLogger instance with the specified environment context
	 *
	 * @example
	 * ```typescript
	 * import { BuildLogger } from '@savvy-web/bun-builder';
	 *
	 * const logger = BuildLogger.createEnvLogger('npm');
	 * logger.info('Building...');
	 * // Output: info    [npm] Building...
	 *
	 * logger.global.info('Global message');
	 * // Output: info    Global message
	 * ```
	 */
	static createEnvLogger(envId: string): EnvLogger {
		const isTest = BuildLogger.isTestEnvironment();
		const envTag = cyan(`[${envId}]`);

		const baseLogger: Logger = {
			info: (message: string): void => {
				if (!isTest) {
					console.log(`${BuildLogger.createPrefix("info", cyan)}${envTag} ${message}`);
				}
			},
			warn: (message: string): void => {
				if (!isTest) {
					console.log(`${BuildLogger.createPrefix("warn", yellow)}${envTag} ${message}`);
				}
			},
			error: (message: string): void => {
				if (!isTest) {
					console.log(`${BuildLogger.createPrefix("error", red)}${envTag} ${message}`);
				}
			},
			success: (message: string, filename?: string): void => {
				if (!isTest) {
					const coloredFilename = filename ? ` ${cyan(filename)}` : "";
					console.log(`${BuildLogger.createPrefix("info", cyan)}${envTag} ${message}${coloredFilename}`);
				}
			},
			ready: (message: string): void => {
				if (!isTest) {
					console.log(`${BuildLogger.createPrefix("ready", green)}${envTag} ${bold(message)}`);
				}
			},
		};

		return {
			...baseLogger,
			global: {
				info: (message: string): void => {
					if (!isTest) {
						console.log(`${BuildLogger.createPrefix("info", cyan)}${message}`);
					}
				},
				warn: (message: string): void => {
					if (!isTest) {
						console.log(`${BuildLogger.createPrefix("warn", yellow)}${message}`);
					}
				},
				error: (message: string): void => {
					if (!isTest) {
						console.log(`${BuildLogger.createPrefix("error", red)}${message}`);
					}
				},
				success: (message: string): void => {
					if (!isTest) {
						console.log(`${BuildLogger.createPrefix("info", cyan)}${green(message)}`);
					}
				},
				ready: (message: string): void => {
					if (!isTest) {
						console.log(`${BuildLogger.createPrefix("ready", green)}${bold(message)}`);
					}
				},
			},
			fileOp: (message: string, files: string[]): void => {
				if (!isTest) {
					const coloredFiles = files.map((f) => cyan(f)).join(", ");
					console.log(`${BuildLogger.createPrefix("info", cyan)}${envTag} ${message}: ${coloredFiles}`);
				}
			},
			entries: (message: string, entries: Record<string, string>): void => {
				if (!isTest) {
					const coloredEntries = Object.entries(entries)
						.map(([name, path]) => `${cyan(name)} => ${path}`)
						.join(", ");
					console.log(`${BuildLogger.createPrefix("info", cyan)}${envTag} ${message}: ${coloredEntries}`);
				}
			},
		};
	}

	/**
	 * Collects file information for the file table.
	 *
	 * @remarks
	 * Reads file sizes from the filesystem for each path. Files that don't exist
	 * or start with `!` (negation pattern) are skipped. Paths are converted to
	 * be relative to `process.cwd()` for display.
	 *
	 * @param outdir - The output directory containing the files
	 * @param files - Array of relative file paths (relative to outdir)
	 * @returns Array of file entries with sizes
	 *
	 * @example
	 * ```typescript
	 * import { BuildLogger } from '@savvy-web/bun-builder';
	 *
	 * const files = await BuildLogger.collectFileInfo('./dist', ['index.js', 'index.d.ts']);
	 * for (const file of files) {
	 *   console.log(`${file.path}: ${BuildLogger.formatSize(file.size)}`);
	 * }
	 * ```
	 */
	static async collectFileInfo(outdir: string, files: string[]): Promise<FileEntry[]> {
		const entries: FileEntry[] = [];

		for (const file of files) {
			// Skip negated entries (excluded files)
			if (file.startsWith("!")) continue;

			const fullPath = join(outdir, file);
			try {
				const stats = await stat(fullPath);
				// Use path relative to cwd for display
				entries.push({
					path: relative(process.cwd(), fullPath),
					size: stats.size,
				});
			} catch {
				// File doesn't exist, skip
			}
		}

		return entries;
	}

	/**
	 * Prints a banner with version info in RSlib style.
	 *
	 * @remarks
	 * Output format:
	 * ```text
	 * Bun Builder v1.0.0
	 * ```
	 *
	 * Suppressed in test environments.
	 *
	 * @param version - The package version to display
	 *
	 * @example
	 * ```typescript
	 * import { BuildLogger } from '@savvy-web/bun-builder';
	 *
	 * BuildLogger.printBanner('1.0.0');
	 * // Output:
	 * // Bun Builder v1.0.0
	 * ```
	 */
	static printBanner(version: string): void {
		if (BuildLogger.isTestEnvironment()) return;
		console.log();
		console.log(`${magenta("Bun Builder")} ${dim(`v${version}`)}`);
		console.log();
	}

	/**
	 * Prints a file table similar to RSlib's output.
	 *
	 * @remarks
	 * Displays a formatted table of files with their sizes:
	 * ```text
	 * File (npm)                                Size
	 * dist/npm/index.js                         1.50 kB
	 * dist/npm/index.d.ts                       2.00 kB
	 *
	 * Total:                                    3.50 kB
	 * ```
	 *
	 * Files are sorted by size (smallest first). Suppressed in test environments.
	 *
	 * @param files - Array of file entries with path and size
	 * @param _outdir - The output directory (unused, kept for API compatibility)
	 * @param label - Optional label suffix (e.g., `"(npm)"` or `"(dev)"`)
	 *
	 * @example
	 * ```typescript
	 * import { BuildLogger } from '@savvy-web/bun-builder';
	 *
	 * const files = [
	 *   { path: 'dist/index.js', size: 1536 },
	 *   { path: 'dist/index.d.ts', size: 2048 },
	 * ];
	 *
	 * BuildLogger.printFileTable(files, './dist', '(npm)');
	 * ```
	 */
	static printFileTable(files: FileEntry[], _outdir: string, label?: string): void {
		if (BuildLogger.isTestEnvironment()) return;
		if (files.length === 0) return;

		// Sort files by size (smallest first)
		const sorted = [...files].sort((a, b) => a.size - b.size);

		// Calculate column widths
		const maxPathLength = Math.max(...sorted.map((f) => f.path.length));
		const pathWidth = Math.max(maxPathLength, 30);

		console.log();
		const header = label ? dim(`File ${label}`) : dim("File");
		console.log(`${header.padEnd(pathWidth + 4)}${dim("Size")}`);

		let totalSize = 0;
		for (const file of sorted) {
			const filePath = dim(file.path.padEnd(pathWidth));
			const fileSize = BuildLogger.formatSize(file.size);
			console.log(`${filePath}    ${green(fileSize)}`);
			totalSize += file.size;
		}

		console.log();
		console.log(`${dim("Total:".padEnd(pathWidth))}    ${bold(green(BuildLogger.formatSize(totalSize)))}`);
	}

	/**
	 * Prints a summary line showing all build targets completed.
	 *
	 * @remarks
	 * Output format:
	 * ```text
	 * ready   Built 2 target(s) in 1.50 s
	 * ```
	 *
	 * Suppressed in test environments.
	 *
	 * @param targets - The targets that were built
	 * @param totalTime - Total build time in milliseconds
	 *
	 * @example
	 * ```typescript
	 * import { BuildLogger } from '@savvy-web/bun-builder';
	 *
	 * BuildLogger.printSummary(['dev', 'npm'], 1500);
	 * // Output: ready   Built 2 target(s) in 1.50 s
	 * ```
	 */
	static printSummary(targets: string[], totalTime: number): void {
		if (BuildLogger.isTestEnvironment()) return;
		console.log();
		console.log(
			`${BuildLogger.createPrefix("ready", green)}${bold(`Built ${targets.length} target(s) in ${BuildLogger.formatTime(totalTime)}`)}`,
		);
	}
}
