/**
 * E2E tests for multi-target publish builds.
 *
 * Verifies that:
 * - Additional publish target directories receive all build artifacts
 * - Each target gets its own transformed package.json
 * - JS, .d.ts, and LICENSE files are present in all target directories
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { assertBuildSucceeded, assertPackageJsonField, assertStdoutContains } from "./utils/assertions.js";
import type { BuildFixtureResult } from "./utils/build-fixture.js";
import { buildFixture, cleanStaleTempDirs, collectOutputFiles, readPackageJson } from "./utils/build-fixture.js";

describe("publish targets E2E", () => {
	let result: BuildFixtureResult;

	beforeAll(async () => {
		cleanStaleTempDirs();
		result = await buildFixture({
			fixture: "__test__/fixtures/multi-target",
			mode: "npm",
		});
	}, 60_000);

	afterAll(() => {
		result?.cleanup();
	});

	test("build succeeds", () => {
		assertBuildSucceeded(result);
	});

	test("primary output (dist/npm) has JS files", () => {
		const hasJs = result.outputFiles.some((f) => f.endsWith(".js"));
		expect(hasJs).toBe(true);
	});

	test("primary output (dist/npm) has declaration files", () => {
		const hasDts = result.outputFiles.some((f) => f.endsWith(".d.ts"));
		expect(hasDts).toBe(true);
	});

	test("primary output (dist/npm) has package.json", () => {
		expect(result.outputFiles).toContain("package.json");
	});

	test("github target directory exists", () => {
		const githubDir = join(result.tempDir, "dist", "github");
		expect(existsSync(githubDir)).toBe(true);
	});

	test("github target has JS files", () => {
		const githubFiles = collectOutputFiles(result, "dist/github");
		const hasJs = githubFiles.some((f) => f.endsWith(".js"));
		expect(hasJs).toBe(true);
	});

	test("github target has declaration files", () => {
		const githubFiles = collectOutputFiles(result, "dist/github");
		const hasDts = githubFiles.some((f) => f.endsWith(".d.ts"));
		expect(hasDts).toBe(true);
	});

	test("github target has LICENSE", () => {
		const githubFiles = collectOutputFiles(result, "dist/github");
		expect(githubFiles).toContain("LICENSE");
	});

	test("github target has package.json", () => {
		const githubFiles = collectOutputFiles(result, "dist/github");
		expect(githubFiles).toContain("package.json");
	});

	test("github target package.json has correct name", () => {
		const pkg = readPackageJson(result, "dist/github");
		expect(pkg.name).toBe("@test/multi-target");
	});

	test("both targets have the same JS files", () => {
		const npmFiles = result.outputFiles.filter((f) => f.endsWith(".js"));
		const githubFiles = collectOutputFiles(result, "dist/github").filter((f) => f.endsWith(".js"));
		expect(githubFiles).toEqual(npmFiles);
	});

	test("stdout mentions npm or build mode", () => {
		assertStdoutContains(result, "npm");
	});

	test("github target package.json is not private", () => {
		assertPackageJsonField(result, "private", false, "dist/github");
	});
});
