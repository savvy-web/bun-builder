/**
 * Unit tests for the BunLibraryBuilder class.
 */

import { describe, expect, test } from "bun:test";
import { BunLibraryBuilder } from "./bun-library-builder.js";

describe("BunLibraryBuilder", () => {
	describe("constructor", () => {
		test("creates instance with default options", () => {
			const builder = new BunLibraryBuilder();

			expect(builder).toBeInstanceOf(BunLibraryBuilder);
		});

		test("creates instance with custom options", () => {
			const builder = new BunLibraryBuilder({
				externals: ["lodash"],
				dtsBundledPackages: ["type-fest"],
			});

			expect(builder).toBeInstanceOf(BunLibraryBuilder);
		});

		test("accepts all option types", () => {
			const builder = new BunLibraryBuilder({
				entry: { index: "./src/index.ts" },
				externals: ["lodash", /^@aws-sdk\//],
				dtsBundledPackages: ["type-fest"],
				targets: ["npm"],
				tsconfigPath: "./tsconfig.build.json",
				exportsAsIndexes: true,
				copyPatterns: ["README.md"],
				define: { __VERSION__: '"1.0.0"' },
				tsdocLint: true,
				apiModel: true,
			});

			expect(builder).toBeInstanceOf(BunLibraryBuilder);
		});
	});

	describe("type exports", () => {
		test("exports BuildTarget type", async () => {
			const { BunLibraryBuilder } = await import("./bun-library-builder.js");

			// TypeScript will verify this at compile time
			// Just ensure the import works
			expect(BunLibraryBuilder).toBeDefined();
		});

		test("exports BunLibraryBuilderOptions type", async () => {
			// The type is re-exported, verify the module loads
			const module = await import("./bun-library-builder.js");

			expect(module.BunLibraryBuilder).toBeDefined();
		});
	});
});

describe("BunLibraryBuilder options", () => {
	test("externals accepts strings", () => {
		const builder = new BunLibraryBuilder({
			externals: ["lodash", "react"],
		});

		expect(builder).toBeInstanceOf(BunLibraryBuilder);
	});

	test("externals accepts RegExp patterns", () => {
		const builder = new BunLibraryBuilder({
			externals: [/^@aws-sdk\//, /^node:/],
		});

		expect(builder).toBeInstanceOf(BunLibraryBuilder);
	});

	test("externals accepts mixed strings and RegExp", () => {
		const builder = new BunLibraryBuilder({
			externals: ["lodash", /^@aws-sdk\//],
		});

		expect(builder).toBeInstanceOf(BunLibraryBuilder);
	});

	test("tsdocLint accepts boolean", () => {
		const builderTrue = new BunLibraryBuilder({ tsdocLint: true });
		const builderFalse = new BunLibraryBuilder({ tsdocLint: false });

		expect(builderTrue).toBeInstanceOf(BunLibraryBuilder);
		expect(builderFalse).toBeInstanceOf(BunLibraryBuilder);
	});

	test("tsdocLint accepts options object", () => {
		const builder = new BunLibraryBuilder({
			tsdocLint: {
				enabled: true,
				onError: "warn",
				include: ["src/index.ts"],
			},
		});

		expect(builder).toBeInstanceOf(BunLibraryBuilder);
	});

	test("apiModel accepts boolean", () => {
		const builderTrue = new BunLibraryBuilder({ apiModel: true });
		const builderFalse = new BunLibraryBuilder({ apiModel: false });

		expect(builderTrue).toBeInstanceOf(BunLibraryBuilder);
		expect(builderFalse).toBeInstanceOf(BunLibraryBuilder);
	});

	test("apiModel accepts options object", () => {
		const builder = new BunLibraryBuilder({
			apiModel: {
				enabled: true,
				filename: "my-api.json",
				localPaths: ["./docs/api"],
			},
		});

		expect(builder).toBeInstanceOf(BunLibraryBuilder);
	});

	test("copyPatterns accepts string array", () => {
		const builder = new BunLibraryBuilder({
			copyPatterns: ["README.md", "LICENSE"],
		});

		expect(builder).toBeInstanceOf(BunLibraryBuilder);
	});

	test("copyPatterns accepts config objects", () => {
		const builder = new BunLibraryBuilder({
			copyPatterns: [
				{ from: "./assets", to: "./assets" },
				{ from: ".npmrc", noErrorOnMissing: true },
			],
		});

		expect(builder).toBeInstanceOf(BunLibraryBuilder);
	});

	test("transform accepts function", () => {
		const builder = new BunLibraryBuilder({
			transform: ({ target, pkg }) => {
				if (target === "npm") {
					delete pkg.devDependencies;
				}
				return pkg;
			},
		});

		expect(builder).toBeInstanceOf(BunLibraryBuilder);
	});

	test("transformFiles accepts async function", () => {
		const builder = new BunLibraryBuilder({
			transformFiles: async (context) => {
				context.outputs.set("test.txt", "test content");
				context.filesArray.add("test.txt");
			},
		});

		expect(builder).toBeInstanceOf(BunLibraryBuilder);
	});
});
