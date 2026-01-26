import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEnvLogger } from "./build-logger.js";

vi.mock("@rsbuild/core", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock("picocolors", () => ({
	default: {
		cyan: (str: string) => str,
		bold: (str: string) => str,
		dim: (str: string) => str,
	},
	cyan: (str: string) => str,
	bold: (str: string) => str,
	dim: (str: string) => str,
}));

import { logger } from "@rsbuild/core";

interface MockLogger {
	info: ReturnType<typeof vi.fn>;
	warn: ReturnType<typeof vi.fn>;
	error: ReturnType<typeof vi.fn>;
}

describe("logger-utils", () => {
	let mockLogger: MockLogger;

	beforeEach(() => {
		// Get the mocked logger
		mockLogger = logger as unknown as MockLogger;
		vi.clearAllMocks();
	});

	describe("createEnvLogger", () => {
		const envId = "test-env";

		it("should create logger with basic methods", () => {
			const logger = createEnvLogger(envId);

			expect(logger.info).toBeInstanceOf(Function);
			expect(logger.warn).toBeInstanceOf(Function);
			expect(logger.error).toBeInstanceOf(Function);
			expect(logger.withTime).toBeInstanceOf(Function);
			expect(logger.success).toBeInstanceOf(Function);
			expect(logger.fileOp).toBeInstanceOf(Function);
			expect(logger.entries).toBeInstanceOf(Function);
			expect(logger.global).toBeDefined();
		});

		it("should suppress logging during test environments", () => {
			const logger = createEnvLogger(envId);

			// All logging methods should be suppressed during tests
			logger.info("test message", "arg1", "arg2");
			logger.warn("warning message");
			logger.error("error message");
			logger.withTime("built successfully", 1500);
			logger.success("copied", "package.json");
			logger.success("completed");
			logger.fileOp("processed files", ["file1.js", "file2.ts"]);
			logger.entries("auto-detected entries", { index: "./src/index.ts" });
			logger.global.info("global info");
			logger.global.warn("global warn");
			logger.global.error("global error");

			// No logging should occur during test execution
			expect(mockLogger.info).not.toHaveBeenCalled();
			expect(mockLogger.warn).not.toHaveBeenCalled();
			expect(mockLogger.error).not.toHaveBeenCalled();
		});

		it("should log messages in non-test environments", async () => {
			// Temporarily mock environment to simulate non-test environment
			const originalEnv = process.env.NODE_ENV;
			const originalVitest = process.env.VITEST;
			const originalJest = process.env.JEST_WORKER_ID;
			const originalArgv = process.argv;

			// Set non-test environment
			process.env.NODE_ENV = "production";
			delete process.env.VITEST;
			delete process.env.JEST_WORKER_ID;
			process.argv = ["node", "build.js"];

			// Re-import to get fresh instance with new environment
			vi.resetModules();

			// Dynamically import the module to get fresh instance
			const { createEnvLogger: freshCreateEnvLogger } = await import("./build-logger.js");

			const logger = freshCreateEnvLogger(envId);

			// Test basic logging methods
			logger.info("test message", "arg1", "arg2");
			logger.warn("warning message");
			logger.error("error message");

			// Verify basic logging calls were made
			expect(mockLogger.info).toHaveBeenCalledWith("test message (test-env)", "arg1", "arg2");
			expect(mockLogger.warn).toHaveBeenCalledWith("warning message (test-env)");
			expect(mockLogger.error).toHaveBeenCalledWith("error message (test-env)");

			// Test withTime method
			logger.withTime("built successfully", 1500);
			expect(mockLogger.info).toHaveBeenCalledWith(
				expect.stringContaining("built successfully in 1.50s"),
				// Check that it includes the env id
			);

			// Test success method with filename
			logger.success("copied", "package.json");
			expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("copied package.json"));

			// Test success method without filename
			logger.success("completed");
			expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("completed"));

			// Test fileOp method
			logger.fileOp("processed files", ["file1.js", "file2.ts"]);
			expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("processed files: file1.js, file2.ts"));

			// Test entries method
			logger.entries("auto-detected entries", { index: "./src/index.ts", utils: "./src/utils.ts" });
			expect(mockLogger.info).toHaveBeenCalledWith(
				expect.stringContaining("auto-detected entries: index => ./src/index.ts, utils => ./src/utils.ts"),
			);

			// Test global methods
			logger.global.info("global info");
			logger.global.warn("global warn");
			logger.global.error("global error");

			expect(mockLogger.info).toHaveBeenCalledWith("global info");
			expect(mockLogger.warn).toHaveBeenCalledWith("global warn");
			expect(mockLogger.error).toHaveBeenCalledWith("global error");

			// Restore original environment
			process.env.NODE_ENV = originalEnv;
			if (originalVitest) process.env.VITEST = originalVitest;
			if (originalJest) process.env.JEST_WORKER_ID = originalJest;
			process.argv = originalArgv;
		});
	});
});
