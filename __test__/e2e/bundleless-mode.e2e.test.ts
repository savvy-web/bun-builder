/**
 * E2E tests for bundleless mode builds.
 *
 * Verifies that:
 * - Bundleless mode preserves source directory structure
 * - Raw .d.ts files are emitted per source file (no DTS rollup)
 * - Test files (.test.d.ts) are excluded via ImportGraph filtering
 * - Internal modules appear in output (not rolled up)
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

describe("bundleless mode E2E", () => {
	let result: BuildFixtureResult;

	beforeAll(async () => {
		cleanStaleTempDirs();
		result = await buildFixture({
			fixture: "__test__/fixtures/bundleless-entry",
			mode: "npm",
			builderOptions: "{ bundle: false }",
		});
	}, 60_000);

	afterAll(() => {
		result?.cleanup();
	});

	test("build succeeds", () => {
		assertBuildSucceeded(result);
	});

	test("produces JS output for index", () => {
		assertOutputExists(result, "index.js");
	});

	test("preserves directory structure for nested modules", () => {
		assertOutputExists(result, "utils/helper.js");
	});

	test("produces raw .d.ts files per source file", () => {
		const hasDts = result.outputFiles.some((f) => f.endsWith(".d.ts"));
		expect(hasDts).toBe(true);
	});

	test("excludes test .d.ts files from output", () => {
		assertNoOutputMatching(result, /\.test\.d\.ts$/);
		assertNoOutputMatching(result, /\.spec\.d\.ts$/);
	});

	test("does not produce helper.test.js in output", () => {
		assertOutputNotExists(result, "helper.test.js");
	});

	test("produces package.json", () => {
		assertOutputExists(result, "package.json");
	});

	test("copies LICENSE to output", () => {
		assertOutputExists(result, "LICENSE");
	});

	test("JS output contains greet function", () => {
		assertOutputContains(result, "index.js", "greet");
	});
});
