/**
 * Logging utilities for the Bun Library Builder.
 *
 * @remarks
 * Provides RSlib-style logging with colored prefixes and formatted output.
 * All logging is automatically suppressed in test environments to keep
 * test output clean.
 *
 * The module provides two logger types:
 * - {@link Logger}: Basic logger with bracketed prefix (e.g., `[tsdoc-lint]`)
 * - {@link EnvLogger}: Environment-aware logger with build target context
 *
 * @packageDocumentation
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
 * Determines if the current process is running in a test environment.
 *
 * @remarks
 * Checks for common test environment indicators:
 * - `NODE_ENV=test`
 * - `VITEST=true`
 * - `JEST_WORKER_ID` environment variable
 * - Test runner names in process arguments
 *
 * @returns `true` if running in a test environment
 *
 * @internal
 */
function isTestEnvironment(): boolean {
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

	// Check for Bun's test runner: argv contains "bun" executable and "test" command
	const hasBun = process.argv.some((arg) => arg.endsWith("/bun") || arg.endsWith("\\bun") || arg === "bun");
	const hasTest = process.argv.includes("test");
	if (hasBun && hasTest) {
		return true;
	}

	return false;
}

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
 * import { isCI } from '@savvy-web/bun-builder';
 *
 * if (isCI()) {
 *   // Use stricter error handling in CI
 * }
 * ```
 *
 * @public
 */
export function isCI(): boolean {
	return process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true";
}

/**
 * Formats elapsed time in milliseconds to a human-readable string.
 *
 * @param ms - The time duration in milliseconds
 * @returns A formatted string (e.g., `"150ms"` or `"2.50 s"`)
 *
 * @example
 * ```typescript
 * import { formatTime } from '@savvy-web/bun-builder';
 *
 * formatTime(150);   // "150ms"
 * formatTime(2500);  // "2.50 s"
 * ```
 *
 * @public
 */
export function formatTime(ms: number): string {
	if (ms < 1000) {
		return `${ms}ms`;
	}
	return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Timer interface for measuring execution time.
 *
 * @public
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
 * Creates a timer for measuring execution time.
 *
 * @returns A timer object with methods to measure and format elapsed time
 *
 * @example
 * ```typescript
 * import { createTimer } from '@savvy-web/bun-builder';
 *
 * const timer = createTimer();
 * // ... perform operation
 * console.log(`Completed in ${timer.format()}`);
 * ```
 *
 * @public
 */
export function createTimer(): Timer {
	const start = Date.now();
	return {
		elapsed: () => Date.now() - start,
		format: () => formatTime(Date.now() - start),
	};
}

/**
 * Formats a file size in bytes to a human-readable string.
 *
 * @param bytes - The size in bytes
 * @returns A formatted string (e.g., `"512 B"` or `"1.50 kB"`)
 *
 * @example
 * ```typescript
 * import { formatSize } from '@savvy-web/bun-builder';
 *
 * formatSize(512);   // "512 B"
 * formatSize(1536);  // "1.50 kB"
 * ```
 *
 * @public
 */
export function formatSize(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	return `${(bytes / 1024).toFixed(2)} kB`;
}

/**
 * Logger interface for build operations.
 *
 * @remarks
 * Provides standard logging methods with consistent formatting.
 * All methods are automatically suppressed in test environments.
 *
 * @public
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
 * @public
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
 * Prefix width to match RSlib-style output.
 *
 * @internal
 */
const PREFIX_WIDTH = 8;

/**
 * Creates a styled prefix like RSlib's logger.
 *
 * @param label - The label text (e.g., "info", "warn")
 * @param color - Coloring function from picocolors
 * @returns Styled prefix string
 *
 * @internal
 */
function createPrefix(label: string, color: (s: string) => string): string {
	const padded = label.padEnd(PREFIX_WIDTH);
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
 * import { createLogger } from '@savvy-web/bun-builder';
 *
 * const logger = createLogger('my-plugin');
 * logger.info('Starting...');
 * // Output: info    [my-plugin] Starting...
 * ```
 *
 * @public
 */
export function createLogger(prefix: string): Logger {
	const isTest = isTestEnvironment();
	const prefixStr = dim(`[${prefix}]`);

	return {
		info: (message: string): void => {
			if (!isTest) {
				console.log(`${createPrefix("info", cyan)}${prefixStr} ${message}`);
			}
		},
		warn: (message: string): void => {
			if (!isTest) {
				console.log(`${createPrefix("warn", yellow)}${prefixStr} ${message}`);
			}
		},
		error: (message: string): void => {
			if (!isTest) {
				console.log(`${createPrefix("error", red)}${prefixStr} ${message}`);
			}
		},
		success: (message: string): void => {
			if (!isTest) {
				console.log(`${createPrefix("info", cyan)}${prefixStr} ${green(message)}`);
			}
		},
		ready: (message: string): void => {
			if (!isTest) {
				console.log(`${createPrefix("ready", green)}${prefixStr} ${message}`);
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
 * import { createEnvLogger } from '@savvy-web/bun-builder';
 *
 * const logger = createEnvLogger('npm');
 * logger.info('Building...');
 * // Output: info    [npm] Building...
 *
 * logger.global.info('Global message');
 * // Output: info    Global message
 * ```
 *
 * @public
 */
export function createEnvLogger(envId: string): EnvLogger {
	const isTest = isTestEnvironment();
	const envTag = cyan(`[${envId}]`);

	const baseLogger: Logger = {
		info: (message: string): void => {
			if (!isTest) {
				console.log(`${createPrefix("info", cyan)}${envTag} ${message}`);
			}
		},
		warn: (message: string): void => {
			if (!isTest) {
				console.log(`${createPrefix("warn", yellow)}${envTag} ${message}`);
			}
		},
		error: (message: string): void => {
			if (!isTest) {
				console.log(`${createPrefix("error", red)}${envTag} ${message}`);
			}
		},
		success: (message: string, filename?: string): void => {
			if (!isTest) {
				const coloredFilename = filename ? ` ${cyan(filename)}` : "";
				console.log(`${createPrefix("info", cyan)}${envTag} ${message}${coloredFilename}`);
			}
		},
		ready: (message: string): void => {
			if (!isTest) {
				console.log(`${createPrefix("ready", green)}${envTag} ${bold(message)}`);
			}
		},
	};

	return {
		...baseLogger,
		global: {
			info: (message: string): void => {
				if (!isTest) {
					console.log(`${createPrefix("info", cyan)}${message}`);
				}
			},
			warn: (message: string): void => {
				if (!isTest) {
					console.log(`${createPrefix("warn", yellow)}${message}`);
				}
			},
			error: (message: string): void => {
				if (!isTest) {
					console.log(`${createPrefix("error", red)}${message}`);
				}
			},
			success: (message: string): void => {
				if (!isTest) {
					console.log(`${createPrefix("info", cyan)}${green(message)}`);
				}
			},
			ready: (message: string): void => {
				if (!isTest) {
					console.log(`${createPrefix("ready", green)}${bold(message)}`);
				}
			},
		},
		fileOp: (message: string, files: string[]): void => {
			if (!isTest) {
				const coloredFiles = files.map((f) => cyan(f)).join(", ");
				console.log(`${createPrefix("info", cyan)}${envTag} ${message}: ${coloredFiles}`);
			}
		},
		entries: (message: string, entries: Record<string, string>): void => {
			if (!isTest) {
				const coloredEntries = Object.entries(entries)
					.map(([name, path]) => `${cyan(name)} => ${path}`)
					.join(", ");
				console.log(`${createPrefix("info", cyan)}${envTag} ${message}: ${coloredEntries}`);
			}
		},
	};
}

/**
 * File entry for the file table display.
 *
 * @public
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
 * @public
 */
export function printBanner(version: string): void {
	if (isTestEnvironment()) return;
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
 * @public
 */
export function printFileTable(files: FileEntry[], _outdir: string, label?: string): void {
	if (isTestEnvironment()) return;
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
		const fileSize = formatSize(file.size);
		console.log(`${filePath}    ${green(fileSize)}`);
		totalSize += file.size;
	}

	console.log();
	console.log(`${dim("Total:".padEnd(pathWidth))}    ${bold(green(formatSize(totalSize)))}`);
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
 * @public
 */
export async function collectFileInfo(outdir: string, files: string[]): Promise<FileEntry[]> {
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
 * @internal
 */
export function printSummary(targets: string[], totalTime: number): void {
	if (isTestEnvironment()) return;
	console.log();
	console.log(
		`${createPrefix("ready", green)}${bold(`Built ${targets.length} target(s) in ${formatTime(totalTime)}`)}`,
	);
}
