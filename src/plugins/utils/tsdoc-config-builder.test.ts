import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TsDocConfigBuilder } from "./tsdoc-config-builder.js";

describe("TsDocConfigBuilder", () => {
	describe("ALL_GROUPS", () => {
		it("should contain all three standardization groups", () => {
			expect(TsDocConfigBuilder.ALL_GROUPS).toEqual(["core", "extended", "discretionary"]);
		});
	});

	describe("TAG_GROUPS", () => {
		it("should lazily return core tags", () => {
			const coreTags = TsDocConfigBuilder.TAG_GROUPS.core;
			expect(coreTags.length).toBeGreaterThan(0);
			expect(coreTags.some((t) => t.tagName === "@param")).toBe(true);
			expect(coreTags.some((t) => t.tagName === "@returns")).toBe(true);
			expect(coreTags.some((t) => t.tagName === "@remarks")).toBe(true);
		});

		it("should lazily return extended tags", () => {
			const extendedTags = TsDocConfigBuilder.TAG_GROUPS.extended;
			expect(extendedTags.length).toBeGreaterThan(0);
			expect(extendedTags.some((t) => t.tagName === "@example")).toBe(true);
			expect(extendedTags.some((t) => t.tagName === "@defaultValue")).toBe(true);
			expect(extendedTags.some((t) => t.tagName === "@see")).toBe(true);
		});

		it("should lazily return discretionary tags", () => {
			const discretionaryTags = TsDocConfigBuilder.TAG_GROUPS.discretionary;
			expect(discretionaryTags.length).toBeGreaterThan(0);
			expect(discretionaryTags.some((t) => t.tagName === "@alpha")).toBe(true);
			expect(discretionaryTags.some((t) => t.tagName === "@beta")).toBe(true);
			expect(discretionaryTags.some((t) => t.tagName === "@public")).toBe(true);
			expect(discretionaryTags.some((t) => t.tagName === "@internal")).toBe(true);
		});
	});

	describe("getTagsForGroup", () => {
		it("should return correct tags for core group", () => {
			const tags = TsDocConfigBuilder.getTagsForGroup("core");
			expect(tags.some((t) => t.tagName === "@param")).toBe(true);
		});

		it("should return correct tags for extended group", () => {
			const tags = TsDocConfigBuilder.getTagsForGroup("extended");
			expect(tags.some((t) => t.tagName === "@example")).toBe(true);
		});

		it("should return correct tags for discretionary group", () => {
			const tags = TsDocConfigBuilder.getTagsForGroup("discretionary");
			expect(tags.some((t) => t.tagName === "@public")).toBe(true);
		});

		it("should include syntaxKind for each tag", () => {
			const tags = TsDocConfigBuilder.getTagsForGroup("core");
			for (const tag of tags) {
				expect(["block", "inline", "modifier"]).toContain(tag.syntaxKind);
			}
		});

		it("should include allowMultiple for applicable tags", () => {
			const extendedTags = TsDocConfigBuilder.getTagsForGroup("extended");
			const exampleTag = extendedTags.find((t) => t.tagName === "@example");
			expect(exampleTag?.allowMultiple).toBe(true);
		});
	});

	describe("isCI", () => {
		const originalEnv = { ...process.env };

		afterEach(() => {
			process.env = { ...originalEnv };
		});

		it("should return true when CI=true", () => {
			process.env.CI = "true";
			process.env.GITHUB_ACTIONS = undefined;
			expect(TsDocConfigBuilder.isCI()).toBe(true);
		});

		it("should return true when GITHUB_ACTIONS=true", () => {
			process.env.CI = undefined;
			process.env.GITHUB_ACTIONS = "true";
			expect(TsDocConfigBuilder.isCI()).toBe(true);
		});

		it("should return false when neither is set", () => {
			process.env.CI = undefined;
			process.env.GITHUB_ACTIONS = undefined;
			expect(TsDocConfigBuilder.isCI()).toBe(false);
		});

		it("should return false when CI=false", () => {
			process.env.CI = "false";
			process.env.GITHUB_ACTIONS = undefined;
			expect(TsDocConfigBuilder.isCI()).toBe(false);
		});
	});

	describe("shouldPersist", () => {
		const originalEnv = { ...process.env };

		afterEach(() => {
			process.env = { ...originalEnv };
		});

		it("should return false when persistConfig is false", () => {
			expect(TsDocConfigBuilder.shouldPersist(false)).toBe(false);
		});

		it("should return true when persistConfig is true", () => {
			expect(TsDocConfigBuilder.shouldPersist(true)).toBe(true);
		});

		it("should return true when persistConfig is a string", () => {
			expect(TsDocConfigBuilder.shouldPersist("./custom/tsdoc.json")).toBe(true);
		});

		it("should return true when not in CI", () => {
			process.env.CI = undefined;
			process.env.GITHUB_ACTIONS = undefined;
			expect(TsDocConfigBuilder.shouldPersist(undefined)).toBe(true);
		});

		it("should return false when in CI (undefined persistConfig)", () => {
			process.env.CI = "true";
			expect(TsDocConfigBuilder.shouldPersist(undefined)).toBe(false);
		});
	});

	describe("getConfigPath", () => {
		it("should return absolute path when given absolute string", () => {
			const result = TsDocConfigBuilder.getConfigPath("/absolute/path/tsdoc.json", "/cwd");
			expect(result).toBe("/absolute/path/tsdoc.json");
		});

		it("should resolve relative path against cwd", () => {
			const result = TsDocConfigBuilder.getConfigPath("./custom/tsdoc.json", "/project");
			expect(result).toBe("/project/custom/tsdoc.json");
		});

		it("should use default path when persistConfig is boolean", () => {
			const result = TsDocConfigBuilder.getConfigPath(true, "/project");
			expect(result).toBe("/project/tsdoc.json");
		});

		it("should use default path when persistConfig is undefined", () => {
			const result = TsDocConfigBuilder.getConfigPath(undefined, "/project");
			expect(result).toBe("/project/tsdoc.json");
		});
	});

	describe("build", () => {
		it("should use all groups by default", () => {
			const result = TsDocConfigBuilder.build();
			expect(result.useStandardTags).toBe(true);
			expect(result.tagDefinitions).toEqual([]);
			expect(Object.keys(result.supportForTags).length).toBeGreaterThan(0);
		});

		it("should enable standard tags when all groups included", () => {
			const result = TsDocConfigBuilder.build({ groups: ["core", "extended", "discretionary"] });
			expect(result.useStandardTags).toBe(true);
		});

		it("should disable standard tags when subset of groups", () => {
			const result = TsDocConfigBuilder.build({ groups: ["core"] });
			expect(result.useStandardTags).toBe(false);
			expect(result.tagDefinitions.length).toBeGreaterThan(0);
		});

		it("should include tags from specified groups only", () => {
			const result = TsDocConfigBuilder.build({ groups: ["core"] });
			expect(result.supportForTags["@param"]).toBe(true);
			expect(result.supportForTags["@public"]).toBeUndefined();
		});

		it("should add custom tag definitions", () => {
			const result = TsDocConfigBuilder.build({
				tagDefinitions: [{ tagName: "@custom", syntaxKind: "block" }],
			});
			expect(result.tagDefinitions.some((t) => t.tagName === "@custom")).toBe(true);
			expect(result.supportForTags["@custom"]).toBe(true);
		});

		it("should allow overriding support for tags", () => {
			const result = TsDocConfigBuilder.build({
				supportForTags: { "@param": false },
			});
			expect(result.supportForTags["@param"]).toBe(false);
		});

		it("should combine groups, custom tags, and overrides", () => {
			const result = TsDocConfigBuilder.build({
				groups: ["core"],
				tagDefinitions: [{ tagName: "@custom", syntaxKind: "inline" }],
				supportForTags: { "@returns": false },
			});
			expect(result.useStandardTags).toBe(false);
			expect(result.tagDefinitions.some((t) => t.tagName === "@param")).toBe(true);
			expect(result.tagDefinitions.some((t) => t.tagName === "@custom")).toBe(true);
			expect(result.supportForTags["@custom"]).toBe(true);
			expect(result.supportForTags["@returns"]).toBe(false);
		});
	});

	describe("writeConfigFile", () => {
		const tempDir = join(import.meta.dir, "__test_temp__");

		beforeEach(async () => {
			await rm(tempDir, { recursive: true, force: true });
			await Bun.write(join(tempDir, ".keep"), "");
		});

		afterEach(async () => {
			await rm(tempDir, { recursive: true, force: true });
		});

		it("should write tsdoc.json file", async () => {
			const configPath = await TsDocConfigBuilder.writeConfigFile({}, tempDir);
			expect(configPath).toBe(join(tempDir, "tsdoc.json"));
			expect(existsSync(configPath)).toBe(true);
		});

		it("should include correct schema", async () => {
			await TsDocConfigBuilder.writeConfigFile({}, tempDir);
			const content = await readFile(join(tempDir, "tsdoc.json"), "utf-8");
			const config = JSON.parse(content);
			expect(config.$schema).toBe("https://developer.microsoft.com/json-schemas/tsdoc/v0/tsdoc.schema.json");
		});

		it("should set noStandardTags to false when all groups enabled", async () => {
			await TsDocConfigBuilder.writeConfigFile({}, tempDir);
			const content = await readFile(join(tempDir, "tsdoc.json"), "utf-8");
			const config = JSON.parse(content);
			expect(config.noStandardTags).toBe(false);
		});

		it("should set noStandardTags to true when subset of groups", async () => {
			await TsDocConfigBuilder.writeConfigFile({ groups: ["core"] }, tempDir);
			const content = await readFile(join(tempDir, "tsdoc.json"), "utf-8");
			const config = JSON.parse(content);
			expect(config.noStandardTags).toBe(true);
		});

		it("should include supportForTags", async () => {
			await TsDocConfigBuilder.writeConfigFile({}, tempDir);
			const content = await readFile(join(tempDir, "tsdoc.json"), "utf-8");
			const config = JSON.parse(content);
			expect(config.supportForTags).toBeDefined();
			expect(config.supportForTags["@param"]).toBe(true);
		});

		it("should include tagDefinitions when subset of groups", async () => {
			await TsDocConfigBuilder.writeConfigFile({ groups: ["core"] }, tempDir);
			const content = await readFile(join(tempDir, "tsdoc.json"), "utf-8");
			const config = JSON.parse(content);
			expect(config.tagDefinitions).toBeDefined();
			expect(config.tagDefinitions.length).toBeGreaterThan(0);
		});

		it("should not include empty tagDefinitions when all groups enabled", async () => {
			await TsDocConfigBuilder.writeConfigFile({}, tempDir);
			const content = await readFile(join(tempDir, "tsdoc.json"), "utf-8");
			const config = JSON.parse(content);
			expect(config.tagDefinitions).toBeUndefined();
		});

		it("should include custom tags in tagDefinitions", async () => {
			await TsDocConfigBuilder.writeConfigFile(
				{
					tagDefinitions: [{ tagName: "@slot", syntaxKind: "block" }],
				},
				tempDir,
			);
			const content = await readFile(join(tempDir, "tsdoc.json"), "utf-8");
			const config = JSON.parse(content);
			expect(config.tagDefinitions.some((t: { tagName: string }) => t.tagName === "@slot")).toBe(true);
		});

		it("should format with tabs and trailing newline", async () => {
			await TsDocConfigBuilder.writeConfigFile({}, tempDir);
			const content = await readFile(join(tempDir, "tsdoc.json"), "utf-8");
			expect(content.includes("\t")).toBe(true);
			expect(content.endsWith("\n")).toBe(true);
		});

		it("should skip write when config matches existing file", async () => {
			// Write initial config
			await TsDocConfigBuilder.writeConfigFile({}, tempDir);
			const firstContent = await readFile(join(tempDir, "tsdoc.json"), "utf-8");

			// Write again with same options
			await TsDocConfigBuilder.writeConfigFile({}, tempDir);
			const secondContent = await readFile(join(tempDir, "tsdoc.json"), "utf-8");

			expect(firstContent).toBe(secondContent);
		});

		it("should overwrite when config differs", async () => {
			// Write initial config with all groups
			await TsDocConfigBuilder.writeConfigFile({}, tempDir);
			const initialContent = await readFile(join(tempDir, "tsdoc.json"), "utf-8");

			// Write with different config
			await TsDocConfigBuilder.writeConfigFile({ groups: ["core"] }, tempDir);
			const updatedContent = await readFile(join(tempDir, "tsdoc.json"), "utf-8");

			expect(initialContent).not.toBe(updatedContent);
		});

		it("should handle malformed existing file", async () => {
			// Write invalid JSON
			await writeFile(join(tempDir, "tsdoc.json"), "invalid json");

			// Should not throw, should overwrite
			const configPath = await TsDocConfigBuilder.writeConfigFile({}, tempDir);
			expect(existsSync(configPath)).toBe(true);

			const content = await readFile(configPath, "utf-8");
			const config = JSON.parse(content);
			expect(config.$schema).toBeDefined();
		});

		it("should set reportUnsupportedHtmlElements to false", async () => {
			await TsDocConfigBuilder.writeConfigFile({}, tempDir);
			const content = await readFile(join(tempDir, "tsdoc.json"), "utf-8");
			const config = JSON.parse(content);
			expect(config.reportUnsupportedHtmlElements).toBe(false);
		});
	});
});
