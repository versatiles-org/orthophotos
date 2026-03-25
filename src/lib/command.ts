/**
 * Unified command execution utilities.
 */

import { spawn } from 'node:child_process';
import { type RetryOptions, withRetry } from './retry.ts';
import { renameSync, rmSync, statSync } from 'node:fs';

interface CommandOutput {
	success: boolean;
	code: number;
	stdout: Uint8Array;
	stderr: Uint8Array;
}

export interface CommandOptions {
	cwd?: string;
	env?: Record<string, string>;
	stdout?: 'inherit' | 'piped' | 'null';
	stderr?: 'inherit' | 'piped' | 'null';
	/** Suppress stdout/stderr during execution (still captured for error messages). Default: false */
	quiet?: boolean;
	/** Suppress stdout/stderr even in error messages. Default: false */
	quietOnError?: boolean;
}

/**
 * Generic command runner with configurable output handling.
 * @param cmd The command to execute
 * @param args Command arguments
 * @param options Command options (cwd, env, stdout, stderr, quiet, quietOnError)
 * @throws Error if the command fails
 */
export async function runCommand(cmd: string, args: string[], options?: CommandOptions): Promise<CommandOutput> {
	return new Promise((resolve, reject) => {
		const quiet = options?.quiet ?? false;
		const stdoutMode = quiet ? 'piped' : (options?.stdout ?? 'inherit');
		const stderrMode = quiet ? 'piped' : (options?.stderr ?? 'inherit');
		const child = spawn(cmd, args, {
			cwd: options?.cwd,
			env: options?.env ? { ...process.env, ...options.env } : undefined,
			stdio: ['inherit', stdoutMode === 'null' ? 'ignore' : 'pipe', stderrMode === 'null' ? 'ignore' : 'pipe'],
		});

		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];

		child.stdout?.on('data', (chunk: Buffer) => {
			stdoutChunks.push(chunk);
			if (stdoutMode === 'inherit') process.stdout.write(chunk);
		});
		child.stderr?.on('data', (chunk: Buffer) => {
			stderrChunks.push(chunk);
			if (stderrMode === 'inherit') process.stderr.write(chunk);
		});

		child.on('error', reject);

		child.on('close', (code) => {
			const exitCode = code ?? 1;
			const result: CommandOutput = {
				success: exitCode === 0,
				code: exitCode,
				stdout: new Uint8Array(Buffer.concat(stdoutChunks)),
				stderr: new Uint8Array(Buffer.concat(stderrChunks)),
			};
			if (!result.success) {
				const parts = [`Command failed: ${cmd} ${args.join(' ')}`, `Exit code: ${exitCode}`];
				if (!options?.quietOnError) {
					const stdout = Buffer.concat(stdoutChunks).toString().trim();
					const stderr = Buffer.concat(stderrChunks).toString().trim();
					if (stdout) parts.push(`stdout:\n${stdout}`);
					if (stderr) parts.push(`stderr:\n${stderr}`);
				}
				reject(new Error(parts.join('\n')));
			} else {
				resolve(result);
			}
		});
	});
}

/**
 * Executes a command with retry logic.
 */
export function runCommandWithRetry(
	cmd: string,
	args: string[],
	retryOptions: RetryOptions = {},
	cmdOptions?: CommandOptions,
): Promise<CommandOutput> {
	return withRetry(() => runCommand(cmd, args, cmdOptions), retryOptions);
}

export interface DownloadOptions {
	/** Minimum expected file size in bytes. Fails if the downloaded file is smaller. Default: 1024 */
	minSize?: number;
	/** Resume a partially downloaded file instead of starting over. Default: false */
	continue?: boolean;
}

/**
 * Downloads a file from a URL using curl.
 * Downloads to a temporary file first, then renames to avoid partial files.
 */
export async function downloadFile(url: string, dest: string, options?: DownloadOptions): Promise<void> {
	const tmp = `${dest}.tmp`;
	const args = ['-sLo', tmp, '--fail'];
	if (options?.continue) args.push('-C', '-');
	args.push(url);
	await runCommand('curl', args);
	if (options?.minSize) {
		const size = statSync(tmp).size;
		if (size < options.minSize) {
			rmSync(tmp, { force: true });
			throw new Error(`Downloaded file is too small (${size} bytes, expected >= ${options.minSize}): ${url}`);
		}
	}
	renameSync(tmp, dest);
}
