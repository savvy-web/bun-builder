/**
 * Unit tests for logging utilities.
 */

import { describe, expect, test } from "bun:test";
import { createTimer, formatSize, formatTime, isCI } from "./logger.js";

describe("formatTime", () => {
	test("formats milliseconds under 1 second", () => {
		expect(formatTime(0)).toBe("0ms");
		expect(formatTime(1)).toBe("1ms");
		expect(formatTime(150)).toBe("150ms");
		expect(formatTime(999)).toBe("999ms");
	});

	test("formats seconds for 1000ms and above", () => {
		expect(formatTime(1000)).toBe("1.00 s");
		expect(formatTime(1500)).toBe("1.50 s");
		expect(formatTime(2500)).toBe("2.50 s");
		expect(formatTime(10000)).toBe("10.00 s");
	});

	test("handles fractional milliseconds", () => {
		expect(formatTime(1234)).toBe("1.23 s");
		expect(formatTime(1999)).toBe("2.00 s");
	});
});

describe("formatSize", () => {
	test("formats bytes under 1024", () => {
		expect(formatSize(0)).toBe("0 B");
		expect(formatSize(1)).toBe("1 B");
		expect(formatSize(512)).toBe("512 B");
		expect(formatSize(1023)).toBe("1023 B");
	});

	test("formats kilobytes for 1024 and above", () => {
		expect(formatSize(1024)).toBe("1.00 kB");
		expect(formatSize(1536)).toBe("1.50 kB");
		expect(formatSize(2048)).toBe("2.00 kB");
		expect(formatSize(10240)).toBe("10.00 kB");
	});

	test("handles fractional kilobytes", () => {
		expect(formatSize(1234)).toBe("1.21 kB");
		expect(formatSize(5678)).toBe("5.54 kB");
	});
});

describe("createTimer", () => {
	test("returns timer with elapsed method", () => {
		const timer = createTimer();

		expect(typeof timer.elapsed).toBe("function");
		expect(typeof timer.elapsed()).toBe("number");
	});

	test("returns timer with format method", () => {
		const timer = createTimer();

		expect(typeof timer.format).toBe("function");
		expect(typeof timer.format()).toBe("string");
	});

	test("elapsed time increases", async () => {
		const timer = createTimer();
		const initial = timer.elapsed();

		// Wait a small amount
		await new Promise((resolve) => setTimeout(resolve, 10));

		const later = timer.elapsed();
		expect(later).toBeGreaterThan(initial);
	});

	test("format returns valid time string", () => {
		const timer = createTimer();
		const formatted = timer.format();

		// Should be either "Xms" or "X.XX s"
		expect(formatted).toMatch(/^\d+ms$|^\d+\.\d{2} s$/);
	});
});

describe("isCI", () => {
	// Note: These tests depend on the environment
	// In actual CI, these would return true

	test("returns boolean", () => {
		const result = isCI();

		expect(typeof result).toBe("boolean");
	});

	test("detects CI environment variable", () => {
		// Save originals
		const originalCI = process.env.CI;
		const originalGitHubActions = process.env.GITHUB_ACTIONS;

		try {
			// Clear both CI indicators for controlled testing
			delete process.env.GITHUB_ACTIONS;

			process.env.CI = "true";
			expect(isCI()).toBe(true);

			process.env.CI = "false";
			expect(isCI()).toBe(false);

			delete process.env.CI;
			expect(isCI()).toBe(false);

			// Test GITHUB_ACTIONS detection
			process.env.GITHUB_ACTIONS = "true";
			expect(isCI()).toBe(true);
		} finally {
			// Restore originals
			if (originalCI !== undefined) {
				process.env.CI = originalCI;
			} else {
				delete process.env.CI;
			}
			if (originalGitHubActions !== undefined) {
				process.env.GITHUB_ACTIONS = originalGitHubActions;
			} else {
				delete process.env.GITHUB_ACTIONS;
			}
		}
	});
});
