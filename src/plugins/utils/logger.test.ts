/**
 * Unit tests for logging utilities.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { BuildLogger } from "./logger.js";

describe("BuildLogger.formatTime", () => {
	test("formats milliseconds under 1 second", () => {
		expect(BuildLogger.formatTime(0)).toBe("0ms");
		expect(BuildLogger.formatTime(1)).toBe("1ms");
		expect(BuildLogger.formatTime(150)).toBe("150ms");
		expect(BuildLogger.formatTime(999)).toBe("999ms");
	});

	test("formats seconds for 1000ms and above", () => {
		expect(BuildLogger.formatTime(1000)).toBe("1.00 s");
		expect(BuildLogger.formatTime(1500)).toBe("1.50 s");
		expect(BuildLogger.formatTime(2500)).toBe("2.50 s");
		expect(BuildLogger.formatTime(10000)).toBe("10.00 s");
	});

	test("handles fractional milliseconds", () => {
		expect(BuildLogger.formatTime(1234)).toBe("1.23 s");
		expect(BuildLogger.formatTime(1999)).toBe("2.00 s");
	});
});

describe("BuildLogger.formatSize", () => {
	test("formats bytes under 1024", () => {
		expect(BuildLogger.formatSize(0)).toBe("0 B");
		expect(BuildLogger.formatSize(1)).toBe("1 B");
		expect(BuildLogger.formatSize(512)).toBe("512 B");
		expect(BuildLogger.formatSize(1023)).toBe("1023 B");
	});

	test("formats kilobytes for 1024 and above", () => {
		expect(BuildLogger.formatSize(1024)).toBe("1.00 kB");
		expect(BuildLogger.formatSize(1536)).toBe("1.50 kB");
		expect(BuildLogger.formatSize(2048)).toBe("2.00 kB");
		expect(BuildLogger.formatSize(10240)).toBe("10.00 kB");
	});

	test("handles fractional kilobytes", () => {
		expect(BuildLogger.formatSize(1234)).toBe("1.21 kB");
		expect(BuildLogger.formatSize(5678)).toBe("5.54 kB");
	});
});

describe("BuildLogger.createTimer", () => {
	test("returns timer with elapsed method", () => {
		const timer = BuildLogger.createTimer();

		expect(typeof timer.elapsed).toBe("function");
		expect(typeof timer.elapsed()).toBe("number");
	});

	test("returns timer with format method", () => {
		const timer = BuildLogger.createTimer();

		expect(typeof timer.format).toBe("function");
		expect(typeof timer.format()).toBe("string");
	});

	test("elapsed time increases", async () => {
		const timer = BuildLogger.createTimer();
		const initial = timer.elapsed();

		// Wait a small amount
		await new Promise((resolve) => setTimeout(resolve, 10));

		const later = timer.elapsed();
		expect(later).toBeGreaterThan(initial);
	});

	test("format returns valid time string", () => {
		const timer = BuildLogger.createTimer();
		const formatted = timer.format();

		// Should be either "Xms" or "X.XX s"
		expect(formatted).toMatch(/^\d+ms$|^\d+\.\d{2} s$/);
	});
});

describe("BuildLogger.isCI", () => {
	/** Saved environment variables for restoration after each test */
	let savedCI: string | undefined;
	let savedGitHubActions: string | undefined;

	beforeEach(() => {
		// Save current environment state
		savedCI = process.env.CI;
		savedGitHubActions = process.env.GITHUB_ACTIONS;

		// Clear CI indicators for controlled testing
		delete process.env.CI;
		delete process.env.GITHUB_ACTIONS;
	});

	afterEach(() => {
		// Restore original environment state
		if (savedCI !== undefined) {
			process.env.CI = savedCI;
		} else {
			delete process.env.CI;
		}
		if (savedGitHubActions !== undefined) {
			process.env.GITHUB_ACTIONS = savedGitHubActions;
		} else {
			delete process.env.GITHUB_ACTIONS;
		}
	});

	test("returns boolean", () => {
		const result = BuildLogger.isCI();

		expect(typeof result).toBe("boolean");
	});

	test("returns false when no CI environment variables are set", () => {
		expect(BuildLogger.isCI()).toBe(false);
	});

	test("returns true when CI=true", () => {
		process.env.CI = "true";

		expect(BuildLogger.isCI()).toBe(true);
	});

	test("returns false when CI=false", () => {
		process.env.CI = "false";

		expect(BuildLogger.isCI()).toBe(false);
	});

	test("returns true when GITHUB_ACTIONS=true", () => {
		process.env.GITHUB_ACTIONS = "true";

		expect(BuildLogger.isCI()).toBe(true);
	});

	test("returns true when either CI or GITHUB_ACTIONS is true", () => {
		// GITHUB_ACTIONS alone
		process.env.GITHUB_ACTIONS = "true";
		expect(BuildLogger.isCI()).toBe(true);

		// CI=false does not block GITHUB_ACTIONS=true (OR logic)
		process.env.CI = "false";
		expect(BuildLogger.isCI()).toBe(true);

		// Both true
		process.env.CI = "true";
		expect(BuildLogger.isCI()).toBe(true);
	});
});
