import { describe, expect, it } from "vitest";
import {
	AutoEntryPlugin,
	DtsPlugin,
	FilesArrayPlugin,
	NodeLibraryBuilder,
	PackageJsonTransformPlugin,
	TsDocConfigBuilder,
} from "./index.js";

describe("@savvy-web/rslib-builder public API", () => {
	describe("NodeLibraryBuilder", () => {
		it("should export NodeLibraryBuilder class with create method", () => {
			expect(NodeLibraryBuilder).toBeDefined();
			expect(typeof NodeLibraryBuilder.create).toBe("function");
		});
	});

	describe("Plugins", () => {
		it("should export AutoEntryPlugin", () => {
			expect(AutoEntryPlugin).toBeDefined();
			expect(typeof AutoEntryPlugin).toBe("function");
		});

		it("should export DtsPlugin", () => {
			expect(DtsPlugin).toBeDefined();
			expect(typeof DtsPlugin).toBe("function");
		});

		it("should export FilesArrayPlugin", () => {
			expect(FilesArrayPlugin).toBeDefined();
			expect(typeof FilesArrayPlugin).toBe("function");
		});

		it("should export PackageJsonTransformPlugin", () => {
			expect(PackageJsonTransformPlugin).toBeDefined();
			expect(typeof PackageJsonTransformPlugin).toBe("function");
		});
	});

	describe("TsDocConfigBuilder", () => {
		it("should export TsDocConfigBuilder class", () => {
			expect(TsDocConfigBuilder).toBeDefined();
			expect(typeof TsDocConfigBuilder).toBe("function");
		});

		it("should have static build method", () => {
			expect(typeof TsDocConfigBuilder.build).toBe("function");
		});
	});
});
