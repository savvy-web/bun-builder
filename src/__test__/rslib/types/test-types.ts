/**
 * Type for mock asset objects used in tests
 */
export interface MockAsset {
	source: () => string;
}

/**
 * Type for mock asset registry used in tests
 */
export type MockAssetRegistry = Record<string, MockAsset>;

/**
 * Type for mock source objects used in webpack/rspack compilation
 */
export interface MockSource {
	source: () => string;
}

/**
 * Creates a mock Stats object for fs operations
 */
export function createMockStats(mtime: Date): import("node:fs").Stats {
	return {
		mtime,
		isFile: () => true,
		isDirectory: () => false,
		isSymbolicLink: () => false,
		isBlockDevice: () => false,
		isCharacterDevice: () => false,
		isFIFO: () => false,
		isSocket: () => false,
	} as import("node:fs").Stats;
}
