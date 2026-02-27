/**
 * E2E tests for multi-entry splitting builds.
 *
 * Verifies that:
 * - Multi-entry builds produce correct JS and .d.ts outputs for each entry
 * - Code splitting extracts shared modules into chunk files
 * - Test files (.test.d.ts) are excluded from output
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	assertBuildSucceeded,
	assertNoOutputMatching,
	assertOutputContains,
	assertOutputExists,
} from "./utils/assertions.js";
import type { BuildFixtureResult } from "./utils/build-fixture.js";
import { buildFixture, cleanStaleTempDirs } from "./utils/build-fixture.js";

describe("multi-entry splitting E2E", () => {
	let result: BuildFixtureResult;

	beforeAll(async () => {
		cleanStaleTempDirs();
		result = await buildFixture({
			fixture: "__test__/fixtures/multi-entry",
			mode: "npm",
		});
	}, 60_000);

	afterAll(() => {
		result?.cleanup();
	});

	test("build succeeds", () => {
		assertBuildSucceeded(result);
	});

	test("produces index.js entry output", () => {
		assertOutputExists(result, "index.js");
	});

	test("produces utils.js entry output", () => {
		assertOutputExists(result, "utils.js");
	});

	test("produces index.d.ts declaration output", () => {
		assertOutputExists(result, "index.d.ts");
	});

	test("produces utils.d.ts declaration output", () => {
		assertOutputExists(result, "utils.d.ts");
	});

	test("produces at least one chunk file (splitting worked)", () => {
		const chunks = result.outputFiles.filter((f) => /^chunk-.*\.js$/.test(f));
		expect(chunks.length).toBeGreaterThanOrEqual(1);
	});

	test("chunk file contains shared count function", () => {
		const chunk = result.outputFiles.find((f) => /^chunk-.*\.js$/.test(f));
		expect(chunk).toBeDefined();
		if (chunk) {
			assertOutputContains(result, chunk, "count");
		}
	});

	test("excludes test .d.ts files from output", () => {
		assertNoOutputMatching(result, /\.test\.d\.ts$/);
		assertNoOutputMatching(result, /\.spec\.d\.ts$/);
	});

	test("produces package.json", () => {
		assertOutputExists(result, "package.json");
	});

	test("copies LICENSE to output", () => {
		assertOutputExists(result, "LICENSE");
	});
});
