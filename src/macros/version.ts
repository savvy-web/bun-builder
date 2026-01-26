import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Gets the package version at compile time.
 *
 * @remarks
 * This macro reads the package.json version during bundling and embeds
 * it directly into the output, avoiding runtime file reads.
 *
 * @returns The package version string
 */
export function getVersion(): string {
	const packageJsonPath = join(import.meta.dir, "../../package.json");
	const content = readFileSync(packageJsonPath, "utf-8");
	const pkg = JSON.parse(content) as { version: string };
	return pkg.version;
}
