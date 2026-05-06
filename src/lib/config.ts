/**
 * Configuration module that validates all required environment variables at startup.
 */

export interface Config {
	dirData: string;
	dirTemp: string;
	ssh?: SshConfig;
}

export interface SshConfig {
	host: string;
	port?: string;
	keyFile?: string;
	dir: string;
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

let cachedConfig: Config | undefined;

export function getConfig(): Config {
	if (cachedConfig) return cachedConfig;

	cachedConfig = {
		dirData: getRequiredEnv('dir_data'),
		dirTemp: getRequiredEnv('dir_temp'),
	};

	const sshHost = getOptionalEnv('ssh_host');
	if (sshHost) {
		cachedConfig.ssh = {
			host: sshHost,
			port: getOptionalEnv('ssh_port'),
			keyFile: getOptionalEnv('ssh_id'),
			dir: getOptionalEnv('ssh_dir') || '/',
		};
	}

	return cachedConfig;
}
