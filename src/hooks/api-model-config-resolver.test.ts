/**
 * Unit tests for ApiModelConfigResolver.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { ApiModelConfigResolver } from "./build-lifecycle.js";

describe("ApiModelConfigResolver.resolve", () => {
	let savedEnvValue: string | undefined;

	beforeEach(() => {
		// Clear env var for isolated testing
		savedEnvValue = process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS];
		delete process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS];
	});

	afterEach(() => {
		// Restore env var
		if (savedEnvValue !== undefined) {
			process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS] = savedEnvValue;
		} else {
			delete process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS];
		}
	});

	describe("basic resolution", () => {
		test("returns disabled config for undefined", () => {
			const config = ApiModelConfigResolver.resolve(undefined, "my-package");

			expect(config.enabled).toBe(false);
			expect(config.filename).toBe("my-package.api.json");
			expect(config.tsdocMetadataEnabled).toBe(false);
		});

		test("returns disabled config for false", () => {
			const config = ApiModelConfigResolver.resolve(false, "my-package");

			expect(config.enabled).toBe(false);
		});

		test("returns enabled config for true", () => {
			const config = ApiModelConfigResolver.resolve(true, "my-package");

			expect(config.enabled).toBe(true);
			expect(config.filename).toBe("my-package.api.json");
			expect(config.tsdocMetadataEnabled).toBe(true);
			expect(config.tsdocMetadataFilename).toBe("tsdoc-metadata.json");
		});

		test("uses custom filename from options", () => {
			const config = ApiModelConfigResolver.resolve({ filename: "custom.api.json" }, "my-package");

			expect(config.enabled).toBe(true);
			expect(config.filename).toBe("custom.api.json");
		});

		test("uses custom tsdocMetadata filename", () => {
			const config = ApiModelConfigResolver.resolve(
				{ tsdocMetadata: { filename: "custom-metadata.json" } },
				"my-package",
			);

			expect(config.tsdocMetadataFilename).toBe("custom-metadata.json");
		});
	});

	describe("localPaths from options", () => {
		test("returns user-defined localPaths", () => {
			const config = ApiModelConfigResolver.resolve({ localPaths: ["../docs/api"] }, "my-package");

			expect(config.localPaths).toEqual(["../docs/api"]);
		});

		test("returns empty array when localPaths not specified", () => {
			const config = ApiModelConfigResolver.resolve({ enabled: true }, "my-package");

			expect(config.localPaths).toEqual([]);
		});
	});
});

describe("ApiModelConfigResolver.getEnvLocalPaths", () => {
	let savedEnvValue: string | undefined;

	beforeEach(() => {
		savedEnvValue = process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS];
		delete process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS];
	});

	afterEach(() => {
		if (savedEnvValue !== undefined) {
			process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS] = savedEnvValue;
		} else {
			delete process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS];
		}
	});

	test("returns empty array when env var not set", () => {
		const paths = ApiModelConfigResolver.getEnvLocalPaths();

		expect(paths).toEqual([]);
	});

	test("returns empty array when env var is empty string", () => {
		process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS] = "";

		const paths = ApiModelConfigResolver.getEnvLocalPaths();

		expect(paths).toEqual([]);
	});

	test("parses single path", () => {
		process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS] = "../docs/api";

		const paths = ApiModelConfigResolver.getEnvLocalPaths();

		expect(paths).toEqual(["../docs/api"]);
	});

	test("parses multiple comma-separated paths", () => {
		process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS] = "../docs/api,../website/lib,./local";

		const paths = ApiModelConfigResolver.getEnvLocalPaths();

		expect(paths).toEqual(["../docs/api", "../website/lib", "./local"]);
	});

	test("trims whitespace from paths", () => {
		process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS] = "  ../docs/api  ,  ../website/lib  ";

		const paths = ApiModelConfigResolver.getEnvLocalPaths();

		expect(paths).toEqual(["../docs/api", "../website/lib"]);
	});

	test("filters out empty segments", () => {
		process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS] = "../docs/api,,../website/lib,";

		const paths = ApiModelConfigResolver.getEnvLocalPaths();

		expect(paths).toEqual(["../docs/api", "../website/lib"]);
	});
});

describe("ApiModelConfigResolver.resolveLocalPaths", () => {
	let savedEnvValue: string | undefined;

	beforeEach(() => {
		savedEnvValue = process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS];
		delete process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS];
	});

	afterEach(() => {
		if (savedEnvValue !== undefined) {
			process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS] = savedEnvValue;
		} else {
			delete process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS];
		}
	});

	test("returns empty array when no user paths and no env var", () => {
		const paths = ApiModelConfigResolver.resolveLocalPaths([]);

		expect(paths).toEqual([]);
	});

	test("returns user paths when no env var", () => {
		const paths = ApiModelConfigResolver.resolveLocalPaths(["../user/path"]);

		expect(paths).toEqual(["../user/path"]);
	});

	test("returns env paths when no user paths", () => {
		process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS] = "../env/path";

		const paths = ApiModelConfigResolver.resolveLocalPaths([]);

		expect(paths).toEqual(["../env/path"]);
	});

	test("merges user paths and env paths with user paths first", () => {
		process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS] = "../env/path";

		const paths = ApiModelConfigResolver.resolveLocalPaths(["../user/path"]);

		expect(paths).toEqual(["../user/path", "../env/path"]);
	});

	test("deduplicates paths", () => {
		process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS] = "../shared/path,../env/path";

		const paths = ApiModelConfigResolver.resolveLocalPaths(["../user/path", "../shared/path"]);

		expect(paths).toEqual(["../user/path", "../shared/path", "../env/path"]);
	});
});

describe("ApiModelConfigResolver.resolve with environment variable", () => {
	let savedEnvValue: string | undefined;

	beforeEach(() => {
		savedEnvValue = process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS];
		delete process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS];
	});

	afterEach(() => {
		if (savedEnvValue !== undefined) {
			process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS] = savedEnvValue;
		} else {
			delete process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS];
		}
	});

	test("uses env paths when apiModel is true", () => {
		process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS] = "../env/path";

		const config = ApiModelConfigResolver.resolve(true, "my-package");

		expect(config.localPaths).toEqual(["../env/path"]);
	});

	test("uses env paths when apiModel is false (still resolves for potential future use)", () => {
		process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS] = "../env/path";

		const config = ApiModelConfigResolver.resolve(false, "my-package");

		expect(config.localPaths).toEqual(["../env/path"]);
	});

	test("merges user and env paths when both specified", () => {
		process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS] = "../env/path";

		const config = ApiModelConfigResolver.resolve({ localPaths: ["../user/path"] }, "my-package");

		expect(config.localPaths).toEqual(["../user/path", "../env/path"]);
	});

	test("user paths take precedence (appear first)", () => {
		process.env[ApiModelConfigResolver.ENV_LOCAL_PATHS] = "../env/first,../env/second";

		const config = ApiModelConfigResolver.resolve({ localPaths: ["../user/path"] }, "my-package");

		expect(config.localPaths[0]).toBe("../user/path");
		expect(config.localPaths).toContain("../env/first");
		expect(config.localPaths).toContain("../env/second");
	});
});
