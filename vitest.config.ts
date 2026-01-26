import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for @savvy-web/rslib-builder
 * @see https://vitest.dev/config/
 */
export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: ["src/**/*.test.ts"],
		coverage: {
			enabled: true,
			provider: "v8",
			reporter: ["text", "text-summary", "html", "lcov"],
			include: ["src/**/*.ts"],
			exclude: ["**/*.test.ts", "**/__test__/**", "**/types/**", "**/*.d.ts", "**/tsconfig/**", "**/cli/**"],
			thresholds: {
				perFile: true,
				statements: 85,
				branches: 85,
				functions: 85,
				lines: 85,
			},
		},
	},
	resolve: {
		alias: {
			"#utils": fileURLToPath(new URL("./src/rslib/plugins/utils", import.meta.url)),
			"#types": fileURLToPath(new URL("./src/types", import.meta.url)),
		},
		extensions: [".ts", ".js", ".json"],
	},
});
