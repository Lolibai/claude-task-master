/**
 * Base tsdown configuration for Task Master monorepo
 * Provides shared configuration that can be extended by individual packages
 */
import type { UserConfig } from 'tsdown';

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = !isProduction;

/**
 * Environment helpers
 */
export const env = {
	isProduction,
	isDevelopment,
	NODE_ENV: process.env.NODE_ENV || 'development'
};

/**
 * Base tsdown configuration for all packages
 * Since everything gets bundled into root dist/ anyway, use consistent settings
 */
export const baseConfig: Partial<UserConfig> = {
	sourcemap: isDevelopment,
	format: 'esm',
	platform: 'node',
	dts: isDevelopment,
	minify: isProduction,
	treeshake: isProduction,
	// Better debugging in development
	...(isDevelopment && {
		keepNames: true,
		splitting: false // Disable code splitting for better stack traces
	}),
	// Keep all npm dependencies external (available via node_modules), but never
	// a path-based id. The `[^@./]` shape alone lets a Windows absolute path
	// (`D:\repo\src\x.js`) look like a bare specifier, which externalizes the
	// whole source tree and emits a bundle importing files that were never
	// written.
	external: (id: string) =>
		!/^(?:[./]|[A-Za-z]:[\\/])/.test(id) && !id.startsWith('@tm/')
};

/**
 * Utility function to merge configurations
 * Simplified for tsdown usage
 */
export function mergeConfig(
	base: Partial<UserConfig>,
	overrides: Partial<UserConfig>
): UserConfig {
	return {
		...base,
		...overrides
	} as UserConfig;
}
