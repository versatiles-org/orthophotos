/**
 * Unified command execution utilities.
 */

import { spawn } from 'node:child_process';
import { type RetryOptions, withRetry } from './retry.ts';

export interface CommandOutput {
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
export async function runCommand(
	cmd: string,
	args: string[],
	options?: CommandOptions,
): Promise<CommandOutput> {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, {
			cwd: options?.cwd,
			env: options?.env ? { ...process.env, ...options.env } : undefined,
			stdio: [
				'inherit',
				mapStdio(options?.stdout ?? 'inherit'),
				mapStdio(options?.stderr ?? 'inherit'),
			],
		});

		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];

		child.stdout?.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
		child.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

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
				reject(new Error(`Command "${cmd}" exited with code ${exitCode}`));
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
