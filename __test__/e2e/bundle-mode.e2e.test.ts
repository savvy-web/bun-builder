/**
 * E2E tests for bundle mode builds.
 *
 * Verifies that:
 * - Bundle mode produces correct JS and .d.ts outputs
 * - Test files (.test.d.ts) are excluded from output
 * - ImportGraph-based filtering works for both DTS rollup and fallback paths
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	assertBuildSucceeded,
	assertNoOutputMatching,
	assertOutputContains,
	assertOutputExists,
	assertOutputNotExists,
} from "./utils/assertions.js";
import type { BuildFixtureResult } from "./utils/build-fixture.js";
import { buildFixture, cleanStaleTempDirs } from "./utils/build-fixture.js";

describe("bundle mode E2E", () => {
	let result: BuildFixtureResult;

	beforeAll(async () => {
		cleanStaleTempDirs();
		result = await buildFixture({
			fixture: "__test__/fixtures/single-entry",
			mode: "npm",
		});
	}, 60_000);

	afterAll(() => {
		result?.cleanup();
	});

	test("build succeeds", () => {
		assertBuildSucceeded(result);
	});

	test("produces JS output", () => {
		assertOutputExists(result, "index.js");
	});

	test("produces declaration output", () => {
		// Should have either rolled-up .d.ts or individual .d.ts files
		const hasDts = result.outputFiles.some((f) => f.endsWith(".d.ts"));
		expect(hasDts).toBe(true);
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

	test("does not include helper.test.d.ts in output", () => {
		assertOutputNotExists(result, "helper.test.d.ts");
	});

	test("JS output contains greet function", () => {
		assertOutputContains(result, "index.js", "greet");
	});
});
