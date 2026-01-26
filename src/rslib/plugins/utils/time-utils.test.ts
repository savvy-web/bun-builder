import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTimer, formatTime } from "./build-logger.js";

describe("time-utils", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("formatTime", () => {
		it("should format milliseconds when less than 1000ms", () => {
			expect(formatTime(500)).toBe("500ms");
			expect(formatTime(999)).toBe("999ms");
		});

		it("should format seconds when 1000ms or more", () => {
			expect(formatTime(1000)).toBe("1.00s");
			expect(formatTime(1500)).toBe("1.50s");
			expect(formatTime(2345)).toBe("2.35s");
		});
	});

	describe("createTimer", () => {
		it("should create a timer that tracks elapsed time", () => {
			const timer = createTimer();

			// Initially, elapsed time should be minimal
			expect(timer.elapsed()).toBeLessThan(100);

			// Advance time by 500ms
			vi.advanceTimersByTime(500);

			expect(timer.elapsed()).toBe(500);
		});

		it("should format elapsed time correctly", () => {
			const timer = createTimer();

			// Advance time by 1.5 seconds
			vi.advanceTimersByTime(1500);

			expect(timer.elapsed()).toBe(1500);
			expect(timer.format()).toBe("1.50s");
		});

		it("should format short elapsed times in milliseconds", () => {
			const timer = createTimer();

			// Advance time by less than 1 second
			vi.advanceTimersByTime(250);

			expect(timer.elapsed()).toBe(250);
			expect(timer.format()).toBe("250ms");
		});
	});
});
