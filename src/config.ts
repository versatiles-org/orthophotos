/**
 * Configuration module that validates all required environment variables at startup.
 * Import this module early to fail fast if required config is missing.
 */

interface Config {
	dirData: string;
	rsyncHost?: string;
	rsyncPort?: string;
	rsyncId?: string;
}

function getRequiredEnv(name: string): string {
	const value = Deno.env.get(name);
	if (value === undefined || value === '') {
		throw new Error(`Required environment variable "${name}" is not set`);
	}
	return value;
}

function getOptionalEnv(name: string): string | undefined {
	return Deno.env.get(name);
}

/**
 * Validates and returns all configuration from environment variables.
 * Throws an error if required variables are missing.
 */
export function loadConfig(): Config {
	return {
		dirData: getRequiredEnv('dir_data'),
		rsyncHost: getOptionalEnv('rsync_host'),
		rsyncPort: getOptionalEnv('rsync_port'),
		rsyncId: getOptionalEnv('rsync_id'),
	};
}

/**
 * Validates that rsync-specific environment variables are set.
 * Call this before using rsync operations.
 */
export function requireRsyncConfig(): { host: string; port: string; id: string } {
	const host = getRequiredEnv('rsync_host');
	const port = getRequiredEnv('rsync_port');
	const id = getRequiredEnv('rsync_id');
	return { host, port, id };
}

/**
 * Returns the data directory path.
 */
export function getDataDir(): string {
	return getRequiredEnv('dir_data');
}
