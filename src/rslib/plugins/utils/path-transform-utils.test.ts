import { describe, expect, it } from "vitest";
import { createTypePath, transformExportPath } from "./package-json-transformer.js";

describe("path-transform-utils", () => {
	describe("transformExportPath", () => {
		it("should handle paths with ./exports/ prefix", () => {
			const result = transformExportPath("./exports/index.ts");
			expect(result).toBe("./index.js");
		});

		it("should handle paths with ./public/ prefix", () => {
			const result = transformExportPath("./public/utils.ts");
			expect(result).toBe("./utils.js");
		});

		it("should handle paths with ./src/ prefix", () => {
			const result = transformExportPath("./src/components.ts");
			expect(result).toBe("./components.js");
		});

		it("should preserve ./bin/ prefix", () => {
			const result = transformExportPath("./bin/cli.ts");
			expect(result).toBe("./bin/cli.js");
		});

		it("should handle .tsx files", () => {
			const result = transformExportPath("./src/Component.tsx");
			expect(result).toBe("./Component.js");
		});

		it("should not transform when processTSExports is false", () => {
			const result = transformExportPath("./src/index.ts", false);
			expect(result).toBe("./index.ts");
		});

		it("should handle TypeScript files with schema names", () => {
			const result = transformExportPath("./src/schema.ts", true);
			expect(result).toBe("./schema.js");
		});

		it("should handle non-TypeScript files", () => {
			const result = transformExportPath("./src/config.js");
			expect(result).toBe("./config.js");
		});

		it("should handle files without prefixes", () => {
			const result = transformExportPath("./index.ts");
			expect(result).toBe("./index.js");
		});

		describe("collapseIndex parameter", () => {
			it("should collapse /index.ts to .js when collapseIndex is true (bundled mode)", () => {
				const result = transformExportPath("./src/rslib/index.ts", true, true);
				expect(result).toBe("./rslib.js");
			});

			it("should collapse /index.tsx to .js when collapseIndex is true (bundled mode)", () => {
				const result = transformExportPath("./src/foo/bar/index.tsx", true, true);
				expect(result).toBe("./foo/bar.js");
			});

			it("should preserve /index.ts when collapseIndex is false", () => {
				const result = transformExportPath("./src/rslib/index.ts", true, false);
				expect(result).toBe("./rslib/index.js");
			});

			it("should preserve /index.tsx when collapseIndex is false", () => {
				const result = transformExportPath("./src/foo/bar/index.tsx", true, false);
				expect(result).toBe("./foo/bar/index.js");
			});

			it("should default to false when collapseIndex is not specified", () => {
				const result = transformExportPath("./src/rslib/index.ts");
				expect(result).toBe("./rslib/index.js");
			});

			it("should not collapse when processTSExports is false, regardless of collapseIndex", () => {
				const result = transformExportPath("./src/rslib/index.ts", false, true);
				expect(result).toBe("./rslib/index.ts");
			});

			it("should collapse nested index files in bundled mode", () => {
				const result = transformExportPath("./src/foo/bar/baz/index.ts", true, true);
				expect(result).toBe("./foo/bar/baz.js");
			});

			it("should handle root index file in bundled mode", () => {
				const result = transformExportPath("./src/index.ts", true, true);
				// Root index doesn't have a parent directory to collapse to
				expect(result).toBe("./index.js");
			});

			it("should handle root index file when collapseIndex is false", () => {
				const result = transformExportPath("./src/index.ts", true, false);
				expect(result).toBe("./index.js");
			});
		});
	});

	describe("createTypePath", () => {
		it("should create .d.ts path from .js path", () => {
			expect(createTypePath("./index.js")).toBe("./index.d.ts");
		});

		it("should create .d.ts path from nested .js path", () => {
			expect(createTypePath("./utils/helper.js")).toBe("./utils/helper.d.ts");
		});

		it("should handle non-.js files by appending .d.ts", () => {
			expect(createTypePath("./config")).toBe("./config.d.ts");
		});

		it("should handle paths with directories", () => {
			expect(createTypePath("./components/Button.js")).toBe("./components/Button.d.ts");
		});

		describe("collapseIndex parameter", () => {
			describe("when collapseIndex is true (bundled mode, default)", () => {
				it("should collapse nested /index.js to parent directory", () => {
					expect(createTypePath("./rslib/index.js", true)).toBe("./rslib.d.ts");
				});

				it("should collapse deeply nested /index.js to parent directory", () => {
					expect(createTypePath("./foo/bar/baz/index.js", true)).toBe("./foo/bar/baz.d.ts");
				});

				it("should NOT collapse root index.js (special case)", () => {
					expect(createTypePath("./index.js", true)).toBe("./index.d.ts");
				});

				it("should handle regular .js files without collapsing", () => {
					expect(createTypePath("./utils/helper.js", true)).toBe("./utils/helper.d.ts");
				});
			});

			describe("when collapseIndex is false", () => {
				it("should preserve nested /index.js paths", () => {
					expect(createTypePath("./rslib/index.js", false)).toBe("./rslib/index.d.ts");
				});

				it("should preserve deeply nested /index.js paths", () => {
					expect(createTypePath("./foo/bar/baz/index.js", false)).toBe("./foo/bar/baz/index.d.ts");
				});

				it("should handle root index.js normally", () => {
					expect(createTypePath("./index.js", false)).toBe("./index.d.ts");
				});

				it("should handle regular .js files normally", () => {
					expect(createTypePath("./utils/helper.js", false)).toBe("./utils/helper.d.ts");
				});
			});
		});
	});
});
