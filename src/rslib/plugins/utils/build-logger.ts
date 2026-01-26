import { logger } from "@rsbuild/core";
import colors from "picocolors";

const { cyan, dim, bold }: typeof colors = colors;

/**
 * Formats elapsed time in milliseconds to a human-readable string with appropriate units.
 *
 * @remarks
 * This utility function formats time durations consistently with RSLib's output format.
 * It automatically chooses the most appropriate unit (milliseconds or seconds) based
 * on the magnitude of the input value.
 *
 * **Formatting Rules:**
 * - Values less than 1000ms are displayed as milliseconds (e.g., "250ms")
 * - Values 1000ms and above are displayed as seconds with 2 decimal places (e.g., "1.25s")
 *
 * @param ms - The time duration in milliseconds to format
 * @returns A formatted string representation of the time duration
 *
 * @example
 * ```typescript
 * console.log(formatTime(150));    // "150ms"
 * console.log(formatTime(999));    // "999ms"
 * console.log(formatTime(1000));   // "1.00s"
 * console.log(formatTime(1250));   // "1.25s"
 * console.log(formatTime(45000));  // "45.00s"
 * ```
 */
export function formatTime(ms: number): string {
	if (ms < 1000) {
		return `${ms}ms`;
	}
	return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Timer interface for measuring execution time.
 */
export interface Timer {
	/** Returns elapsed time in milliseconds */
	elapsed: () => number;
	/** Returns formatted elapsed time string */
	format: () => string;
}

/**
 * Creates a high-precision timer for measuring execution time and performance monitoring.
 *
 * @remarks
 * This function creates a timer object that captures the current timestamp and provides
 * methods to measure elapsed time. The timer uses `Date.now()` for millisecond precision
 * and is ideal for performance monitoring in build processes and plugin execution.
 *
 * The returned timer object provides two methods:
 * - `elapsed()`: Returns raw milliseconds for calculations or comparisons
 * - `format()`: Returns a formatted string suitable for user-facing output
 *
 * @returns A timer object with methods to measure and format elapsed time
 *
 * @example
 * ```typescript
 * // Basic usage for performance monitoring
 * const timer = createTimer();
 *
 * // Simulate some work
 * await someAsyncOperation();
 *
 * console.log(`Operation took: ${timer.format()}`);
 * // Output: "Operation took: 1.25s"
 *
 * console.log(`Raw milliseconds: ${timer.elapsed()}`);
 * // Output: "Raw milliseconds: 1250"
 * ```
 */
export function createTimer(): Timer {
	const start = Date.now();
	return {
		elapsed: () => Date.now() - start,
		format: () => formatTime(Date.now() - start),
	};
}

/**
 * Determines if the current process is running in a test environment.
 *
 * @remarks
 * This function checks multiple indicators to reliably detect test environments
 * including environment variables set by popular testing frameworks (Vitest, Jest)
 * and command-line arguments. This detection is used to suppress logging output
 * during test runs to keep test output clean.
 *
 * @returns True if running in a test environment, false otherwise
 *
 * @internal This function is used internally by the logger to suppress output during tests
 */
function isTestEnvironment(): boolean {
	return (
		process.env.NODE_ENV === "test" ||
		process.env.VITEST === "true" ||
		process.env.JEST_WORKER_ID !== undefined ||
		process.argv.some((arg) => arg.includes("vitest") || arg.includes("jest"))
	);
}

/**
 * Logger interface returned by createEnvLogger.
 */
export interface EnvLogger {
	info: (message: string, ...args: unknown[]) => void;
	warn: (message: string, ...args: unknown[]) => void;
	error: (message: string, ...args: unknown[]) => void;
	withTime: (message: string, time: number, ...args: unknown[]) => void;
	success: (message: string, filename?: string, ...args: unknown[]) => void;
	fileOp: (message: string, files: string[], ...args: unknown[]) => void;
	entries: (message: string, entries: Record<string, string>, ...args: unknown[]) => void;
	global: {
		info: (message: string, ...args: unknown[]) => void;
		warn: (message: string, ...args: unknown[]) => void;
		error: (message: string, ...args: unknown[]) => void;
	};
}

/**
 * Creates an environment-aware logger with enhanced styling and automatic test suppression.
 *
 * @remarks
 * This factory function creates a comprehensive logging interface that provides:
 * - Environment-specific context (envId) appended to all messages
 * - Automatic suppression during test runs to keep test output clean
 * - Color-coded output using picocolors for better readability
 * - Specialized logging methods for different types of operations
 * - Integration with RSBuild's logging system
 *
 * The logger emulates RSLib's logging style while adding enhanced functionality
 * for file operations, timing information, and entry mappings commonly used
 * during build processes.
 *
 * @param envId - The environment identifier (e.g., "development", "production", "jsr")
 * @returns A logger object with various logging methods
 *
 * @example
 * ```typescript
 * // Create a logger for JSR environment
 * const log = createEnvLogger("jsr");
 *
 * // Basic logging
 * log.info("Starting bundling process");
 * log.warn("Deprecated API usage detected");
 * log.error("Failed to resolve module");
 *
 * // Specialized logging
 * log.success("Bundle created", "output.js");
 * log.withTime("Compilation completed", 1500);
 * log.fileOp("Processing files", ["index.ts", "utils.ts"]);
 * log.entries("Entry points", { main: "./src/index.ts", cli: "./src/cli.ts" });
 *
 * // Global logging (without environment context)
 * log.global.info("Global configuration loaded");
 * ```
 *
 * @example
 * ```typescript
 * // Common usage in build plugins
 * export const MyBuildPlugin = (): RsbuildPlugin => {
 *   return {
 *     name: "my-plugin",
 *     setup(api: RsbuildPluginAPI): void {
 *       api.processAssets({ stage: "optimize" }, async (compiler) => {
 *         const envId = compiler.compilation?.name || "unknown";
 *         const log = createEnvLogger(envId);
 *
 *         const startTime = Date.now();
 *         log.info("Starting asset optimization");
 *
 *         // ... processing logic ...
 *
 *         const duration = Date.now() - startTime;
 *         log.withTime("Asset optimization completed", duration);
 *       });
 *     },
 *   };
 * };
 * ```
 *
 * @see {@link formatTime} for the time formatting utility used in `withTime` method
 */
export function createEnvLogger(envId: string): EnvLogger {
	const isTest = isTestEnvironment();

	return {
		/**
		 * Logs an informational message with environment context.
		 *
		 * @param message - The message to log
		 * @param args - Additional arguments to pass to the logger
		 */
		info: (message: string, ...args: unknown[]): void => {
			if (!isTest) {
				logger.info(`${message} (${cyan(envId)})`, ...args);
			}
		},
		/**
		 * Logs a warning message with environment context.
		 *
		 * @param message - The warning message to log
		 * @param args - Additional arguments to pass to the logger
		 */
		warn: (message: string, ...args: unknown[]): void => {
			if (!isTest) {
				logger.warn(`${message} (${cyan(envId)})`, ...args);
			}
		},
		/**
		 * Logs an error message with environment context.
		 *
		 * @param message - The error message to log
		 * @param args - Additional arguments to pass to the logger
		 */
		error: (message: string, ...args: unknown[]): void => {
			if (!isTest) {
				logger.error(`${message} (${cyan(envId)})`, ...args);
			}
		},
		/**
		 * Logs a message with timing information and environment context.
		 *
		 * @remarks
		 * This method is useful for performance monitoring during build processes.
		 * The time is automatically formatted using the {@link formatTime} utility
		 * to display in a human-readable format (e.g., "1.5s", "250ms").
		 *
		 * @param message - The message describing the timed operation
		 * @param time - The duration in milliseconds
		 * @param args - Additional arguments to pass to the logger
		 *
		 * @example
		 * ```typescript
		 * const start = Date.now();
		 * // ... some operation ...
		 * const duration = Date.now() - start;
		 * log.withTime("File processing completed", duration);
		 * // Output: "File processing completed in 1.2s (jsr)"
		 * ```
		 */
		withTime: (message: string, time: number, ...args: unknown[]): void => {
			/* v8 ignore start - Logging utility suppressed during tests */
			if (!isTest) {
				const env = dim(`(${envId})`);
				logger.info(`${message} in ${bold(formatTime(time))} ${env}`, ...args);
			}
			/* v8 ignore stop */
		},
		/**
		 * Logs a success message with optional colored filename and environment context.
		 *
		 * @remarks
		 * This method is designed for reporting successful operations, particularly
		 * file-related tasks. The filename is highlighted in cyan for better visibility.
		 *
		 * @param message - The success message to log
		 * @param filename - Optional filename to highlight in the message
		 * @param args - Additional arguments to pass to the logger
		 *
		 * @example
		 * ```typescript
		 * log.success("Bundle created", "dist/index.js");
		 * // Output: "Bundle created dist/index.js (jsr)"
		 *
		 * log.success("All tests passed");
		 * // Output: "All tests passed (jsr)"
		 * ```
		 */
		success: (message: string, filename?: string, ...args: unknown[]): void => {
			/* v8 ignore start - Logging utility suppressed during tests */
			if (!isTest) {
				const coloredFilename = filename ? cyan(filename) : "";
				const fullMessage = filename ? `${message} ${coloredFilename}` : message;
				const env = dim(`(${envId})`);
				logger.info(`${fullMessage} ${env}`, ...args);
			}
			/* v8 ignore stop */
		},
		/**
		 * Logs a file operation message with a list of colored filenames.
		 *
		 * @remarks
		 * This method is useful for reporting operations that affect multiple files.
		 * All filenames are highlighted in cyan and joined with commas for readability.
		 *
		 * @param message - The message describing the file operation
		 * @param files - Array of filenames involved in the operation
		 * @param args - Additional arguments to pass to the logger
		 *
		 * @example
		 * ```typescript
		 * log.fileOp("Processing TypeScript files", ["index.ts", "utils.ts", "types.ts"]);
		 * // Output: "Processing TypeScript files: index.ts, utils.ts, types.ts (jsr)"
		 * ```
		 */
		fileOp: (message: string, files: string[], ...args: unknown[]): void => {
			/* v8 ignore start - Logging utility suppressed during tests */
			if (!isTest) {
				const coloredFiles = files.map((f) => cyan(f)).join(", ");
				const env = dim(`(${envId})`);
				logger.info(`${message}: ${coloredFiles} ${env}`, ...args);
			}
			/* v8 ignore stop */
		},
		/**
		 * Logs entry point mappings with colored key-value pairs.
		 *
		 * @remarks
		 * This method is specifically designed for displaying entry point configurations
		 * during build processes. It formats the mappings as "key =\> value" pairs with
		 * cyan highlighting for better readability.
		 *
		 * @param message - The message describing the entry mappings
		 * @param entries - Object containing entry name to path mappings
		 * @param args - Additional arguments to pass to the logger
		 *
		 * @example
		 * ```typescript
		 * log.entries("Discovered entry points", {
		 *   main: "./src/index.ts",
		 *   cli: "./src/cli.ts",
		 *   worker: "./src/worker.ts"
		 * });
		 * // Output: "Discovered entry points: main => ./src/index.ts, cli => ./src/cli.ts, worker => ./src/worker.ts (jsr)"
		 * ```
		 */
		entries: (message: string, entries: Record<string, string>, ...args: unknown[]): void => {
			/* v8 ignore start - Logging utility suppressed during tests */
			if (!isTest) {
				const coloredEntries = Object.entries(entries)
					.map(([name, path]) => cyan(`${name} => ${path}`))
					.join(", ");
				const env = dim(`(${envId})`);
				logger.info(`${message}: ${coloredEntries} ${env}`, ...args);
			}
			/* v8 ignore stop */
		},
		/**
		 * Global logging methods that output messages without environment context.
		 *
		 * @remarks
		 * These methods are useful for logging global or system-wide messages that
		 * are not specific to a particular build environment. They bypass the
		 * environment context formatting while still respecting test suppression.
		 */
		global: {
			/**
			 * Logs a global informational message without environment context.
			 *
			 * @param message - The message to log
			 * @param args - Additional arguments to pass to the logger
			 */
			info: (message: string, ...args: unknown[]): void => {
				/* v8 ignore start - Logging utility suppressed during tests */
				if (!isTest) {
					logger.info(message, ...args);
				}
				/* v8 ignore stop */
			},
			/**
			 * Logs a global warning message without environment context.
			 *
			 * @param message - The warning message to log
			 * @param args - Additional arguments to pass to the logger
			 */
			warn: (message: string, ...args: unknown[]): void => {
				/* v8 ignore start - Logging utility suppressed during tests */
				if (!isTest) {
					logger.warn(message, ...args);
				}
				/* v8 ignore stop */
			},
			/**
			 * Logs a global error message without environment context.
			 *
			 * @param message - The error message to log
			 * @param args - Additional arguments to pass to the logger
			 */
			error: (message: string, ...args: unknown[]): void => {
				/* v8 ignore start - Logging utility suppressed during tests */
				if (!isTest) {
					logger.error(message, ...args);
				}
				/* v8 ignore stop */
			},
		},
	};
}
