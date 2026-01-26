import tsParser from "@typescript-eslint/parser";
import type { Linter } from "eslint";
import tsdoc from "eslint-plugin-tsdoc";

const config: Linter.Config[] = [
	{
		ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**"],
	},
	{
		files: ["src/**/*.ts"],
		ignores: ["**/*.test.ts", "**/__test__/**"],
		languageOptions: {
			parser: tsParser,
		},
		plugins: { tsdoc },
		rules: {
			"tsdoc/syntax": "error",
		},
	},
];

export default config;
