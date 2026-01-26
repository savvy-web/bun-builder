import type { TsConfigJson } from "type-fest";

/**
 * TypeScript configuration with JSON schema support.
 *
 * @remarks
 * Extends type-fest's TsConfigJson to include the $schema property
 * for JSON schema validation in editors.
 */
export interface TSConfigJsonWithSchema extends TsConfigJson {
	/**
	 * JSON schema URL for tsconfig.json validation.
	 *
	 * @example
	 * "https://json.schemastore.org/tsconfig.json"
	 */
	$schema?: string;
}
