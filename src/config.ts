/**
 * Configuration module that validates all required environment variables at startup.
 * Import this module early to fail fast if required config is missing.
 */

interface Config {
	dirData: string;
	dirTemp: string;
	sshHost?: string;
	sshPort?: string;
	sshId?: string;
	sshDir?: string;
}

function getRequiredEnv(name: string): string {
	const value = process.env[name];
	if (value === undefined || value === '') {
		throw new Error(`Required environment variable "${name}" is not set`);
	}
	return value;
}

function getOptionalEnv(name: string): string | undefined {
	return process.env[name];
}

/**
 * Validates and returns all configuration from environment variables.
 * Throws an error if required variables are missing.
 */
export function loadConfig(): Config {
	return {
		dirData: getRequiredEnv('dir_data'),
		dirTemp: getRequiredEnv('dir_temp'),
		sshHost: getOptionalEnv('ssh_host'),
		sshPort: getOptionalEnv('ssh_port'),
		sshId: getOptionalEnv('ssh_id'),
		sshDir: getOptionalEnv('ssh_dir'),
	};
}

/**
 * Returns the temp directory path.
 */
export function getTempDir(): string {
	return getRequiredEnv('dir_temp');
}

/**
 * Validates that SSH connection environment variables are set.
 * Call this before using remote operations.
 */
export function requireSshConfig(): {
	host: string;
	port: string;
	id: string;
	dir: string;
} {
	const host = getRequiredEnv('ssh_host');
	const port = getRequiredEnv('ssh_port');
	const id = getRequiredEnv('ssh_id');
	const dir = getRequiredEnv('ssh_dir');
	return { host, port, id, dir };
}

/**
 * Returns the data directory path.
 */
export function getDataDir(): string {
	return getRequiredEnv('dir_data');
}
