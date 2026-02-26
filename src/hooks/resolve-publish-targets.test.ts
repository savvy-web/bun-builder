/**
 * Unit tests for resolvePublishTargets.
 */

import { describe, expect, test } from "bun:test";
import type { PackageJson } from "../types/package-json.js";
import { resolvePublishTargets } from "./build-lifecycle.js";

const CWD = "/project";
const OUTDIR = "/project/dist/npm";

describe("resolvePublishTargets", () => {
	describe("no targets configured", () => {
		test("returns empty array when publishConfig is undefined", () => {
			const pkg: PackageJson = { name: "test" };
			expect(resolvePublishTargets(pkg, CWD, OUTDIR)).toEqual([]);
		});

		test("returns empty array when publishConfig has no targets", () => {
			const pkg: PackageJson = { name: "test", publishConfig: { access: "public" } };
			expect(resolvePublishTargets(pkg, CWD, OUTDIR)).toEqual([]);
		});

		test("returns empty array when targets is empty array", () => {
			const pkg: PackageJson = { name: "test", publishConfig: { targets: [] } };
			expect(resolvePublishTargets(pkg, CWD, OUTDIR)).toEqual([]);
		});
	});

	describe("shorthand strings", () => {
		test("resolves 'npm' shorthand", () => {
			const pkg: PackageJson = { name: "test", publishConfig: { targets: ["npm"] } };
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target).toBeDefined();
			expect(target).toEqual({
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: OUTDIR,
				access: "restricted",
				provenance: true,
				tag: "latest",
			});
		});

		test("resolves 'github' shorthand", () => {
			const pkg: PackageJson = { name: "test", publishConfig: { targets: ["github"] } };
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target).toBeDefined();
			expect(target).toEqual({
				protocol: "npm",
				registry: "https://npm.pkg.github.com/",
				directory: OUTDIR,
				access: "restricted",
				provenance: true,
				tag: "latest",
			});
		});

		test("resolves 'jsr' shorthand", () => {
			const pkg: PackageJson = { name: "test", publishConfig: { targets: ["jsr"] } };
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target).toBeDefined();
			expect(target).toEqual({
				protocol: "jsr",
				registry: null,
				directory: OUTDIR,
				access: "restricted",
				provenance: false,
				tag: "latest",
			});
		});

		test("resolves URL shorthand as custom npm registry", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: { targets: ["https://custom.registry.io/"] },
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target).toBeDefined();
			expect(target).toEqual({
				protocol: "npm",
				registry: "https://custom.registry.io/",
				directory: OUTDIR,
				access: "restricted",
				provenance: false,
				tag: "latest",
			});
		});

		test("resolves http URL shorthand", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: { targets: ["http://localhost:4873/"] },
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target).toBeDefined();
			expect(target!.protocol).toBe("npm");
			expect(target!.registry).toBe("http://localhost:4873/");
		});

		test("throws on unknown shorthand string", () => {
			const pkg: PackageJson = { name: "test", publishConfig: { targets: ["unknown"] } };
			expect(() => resolvePublishTargets(pkg, CWD, OUTDIR)).toThrow("Unknown publish target shorthand: unknown");
		});
	});

	describe("full object targets", () => {
		test("resolves npm target with all fields", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: {
					targets: [
						{
							protocol: "npm",
							registry: "https://registry.npmjs.org/",
							directory: "dist/npm",
							access: "public",
							provenance: true,
							tag: "next",
						},
					],
				},
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target).toBeDefined();
			expect(target).toEqual({
				protocol: "npm",
				registry: "https://registry.npmjs.org/",
				directory: "/project/dist/npm",
				access: "public",
				provenance: true,
				tag: "next",
			});
		});

		test("resolves JSR target with null registry", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: { targets: [{ protocol: "jsr" }] },
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target).toBeDefined();
			expect(target!.protocol).toBe("jsr");
			expect(target!.registry).toBeNull();
		});

		test("defaults protocol to npm when not specified", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: { targets: [{ registry: "https://custom.reg/" }] },
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target!.protocol).toBe("npm");
		});

		test("defaults registry to npmjs.org for npm protocol", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: { targets: [{ protocol: "npm" }] },
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target!.registry).toBe("https://registry.npmjs.org/");
		});

		test("defaults provenance to false", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: { targets: [{ protocol: "npm" }] },
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target!.provenance).toBe(false);
		});

		test("defaults tag to 'latest'", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: { targets: [{ protocol: "npm" }] },
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target!.tag).toBe("latest");
		});
	});

	describe("defaults from publishConfig", () => {
		test("inherits access from publishConfig", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: { access: "public", targets: ["npm"] },
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target!.access).toBe("public");
		});

		test("uses publishConfig.directory as default directory", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: { directory: "dist/custom", targets: ["npm"] },
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target!.directory).toBe("/project/dist/custom");
		});

		test("target directory overrides publishConfig.directory", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: {
					directory: "dist/default",
					targets: [{ protocol: "npm", directory: "dist/override" }],
				},
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target!.directory).toBe("/project/dist/override");
		});

		test("falls back to outdir when no directory specified", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: { targets: ["npm"] },
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target!.directory).toBe(OUTDIR);
		});

		test("target access overrides publishConfig.access", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: {
					access: "restricted",
					targets: [{ protocol: "npm", access: "public" }],
				},
			};
			const [target] = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(target!.access).toBe("public");
		});
	});

	describe("multiple targets", () => {
		test("resolves mixed shorthand and object targets", () => {
			const pkg: PackageJson = {
				name: "test",
				publishConfig: {
					access: "public",
					targets: ["npm", "github", { protocol: "jsr" }],
				},
			};
			const result = resolvePublishTargets(pkg, CWD, OUTDIR);

			expect(result).toHaveLength(3);
			const [npm, github, jsr] = result;
			expect(npm!.registry).toBe("https://registry.npmjs.org/");
			expect(github!.registry).toBe("https://npm.pkg.github.com/");
			expect(jsr!.protocol).toBe("jsr");
			expect(jsr!.registry).toBeNull();
		});
	});
});
