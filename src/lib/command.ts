/**
 * Unified command execution utilities.
 */

import { spawn } from 'node:child_process';
import { type RetryOptions, withRetry } from './retry.ts';

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
}

function mapStdio(mode: 'inherit' | 'piped' | 'null' | undefined): 'inherit' | 'pipe' | 'ignore' {
	switch (mode) {
		case 'piped':
			return 'pipe';
		case 'null':
			return 'ignore';
		default:
			return 'inherit';
	}
}

/**
 * Generic command runner with configurable output handling.
 * @param cmd The command to execute
 * @param args Command arguments
 * @param options Command options (cwd, env, stdout, stderr)
 * @throws Error if the command fails
 */
export async function runCommand(cmd: string, args: string[], options?: CommandOptions): Promise<CommandOutput> {
	return new Promise((resolve, reject) => {
		const stdoutMode = options?.stdout ?? 'inherit';
		const stderrMode = options?.stderr ?? 'inherit';
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
				const stdout = Buffer.concat(stdoutChunks).toString().trim();
				const stderr = Buffer.concat(stderrChunks).toString().trim();
				const parts = [`Command failed: ${cmd} ${args.join(' ')}`, `Exit code: ${exitCode}`];
				if (stdout) parts.push(`stdout:\n${stdout}`);
				if (stderr) parts.push(`stderr:\n${stderr}`);
				reject(new Error(parts.join('\n')));
			} else {
				resolve(result);
			}
		});
	});
}

/**
 * Executes a command with retry logic.
 * @param cmd The command to execute
 * @param args Command arguments
 * @param retryOptions Retry configuration options
 * @param cmdOptions Command options (cwd, env, stdout, stderr)
 * @returns The command output
 * @throws If the command fails after all retry attempts
 */
export function runCommandWithRetry(
	cmd: string,
	args: string[],
	retryOptions: RetryOptions = {},
	cmdOptions?: CommandOptions,
): Promise<CommandOutput> {
	return withRetry(() => runCommand(cmd, args, cmdOptions), retryOptions);
}

/**
 * Downloads a file from a URL using curl.
 * Downloads to a temporary file first, then renames to avoid partial files.
 */
export async function downloadFile(url: string, dest: string): Promise<void> {
	const tmp = `${dest}.tmp`;
	await runCommand('curl', ['-so', tmp, url]);
	const { renameSync } = await import('node:fs');
	renameSync(tmp, dest);
}
