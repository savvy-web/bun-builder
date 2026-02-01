/**
 * Unit tests for the ImportGraph class.
 */

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { ImportGraph } from "./import-graph.js";

describe("ImportGraph", () => {
	describe("traceFromPackageExports", () => {
		test("discovers files from package.json exports", () => {
			const cwd = process.cwd();
			const graph = new ImportGraph({ rootDir: cwd });
			const result = graph.traceFromPackageExports(join(cwd, "package.json"));

			// Should find at least the main entry file
			expect(result.files.length).toBeGreaterThan(0);
			expect(result.entries.length).toBeGreaterThan(0);

			// All files should be .ts files (not .d.ts)
			for (const file of result.files) {
				expect(file.endsWith(".ts")).toBe(true);
				expect(file.endsWith(".d.ts")).toBe(false);
			}

			// Should not include test files
			for (const file of result.files) {
				expect(file.includes(".test.")).toBe(false);
				expect(file.includes(".spec.")).toBe(false);
			}
		});

		test("returns error for missing package.json", () => {
			const graph = new ImportGraph({ rootDir: "/nonexistent" });
			const result = graph.traceFromPackageExports("/nonexistent/package.json");

			expect(result.files).toEqual([]);
			expect(result.errors.length).toBeGreaterThan(0);
			expect(result.errors[0]?.type).toBe("package_json_not_found");
		});
	});

	describe("traceFromEntries", () => {
		test("discovers files from explicit entries", () => {
			const cwd = process.cwd();
			const graph = new ImportGraph({ rootDir: cwd });
			const result = graph.traceFromEntries(["./src/index.ts"]);

			// Should find files
			expect(result.files.length).toBeGreaterThan(0);
			expect(result.entries.length).toBe(1);

			// Entry should be included in files
			const hasEntry = result.files.some((f) => f.endsWith("index.ts"));
			expect(hasEntry).toBe(true);
		});

		test("returns error for missing entry file", () => {
			const cwd = process.cwd();
			const graph = new ImportGraph({ rootDir: cwd });
			const result = graph.traceFromEntries(["./nonexistent.ts"]);

			expect(result.errors.length).toBeGreaterThan(0);
			expect(result.errors[0]?.type).toBe("entry_not_found");
		});
	});

	describe("static methods", () => {
		test("fromPackageExports works as convenience method", () => {
			const cwd = process.cwd();
			const result = ImportGraph.fromPackageExports(join(cwd, "package.json"), { rootDir: cwd });

			expect(result.files.length).toBeGreaterThan(0);
		});

		test("fromEntries works as convenience method", () => {
			const cwd = process.cwd();
			const result = ImportGraph.fromEntries(["./src/index.ts"], { rootDir: cwd });

			expect(result.files.length).toBeGreaterThan(0);
		});
	});
});
