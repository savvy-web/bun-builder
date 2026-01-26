export {};

declare global {
	namespace NodeJS {
		interface ProcessEnv {
			/** The environment mode (production or development). */
			NODE_ENV?: string;
			/** The package version injected at build time. */
			__PACKAGE_VERSION__: string;
		}
	}
}
