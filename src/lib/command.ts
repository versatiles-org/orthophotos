/**
 * Unified command execution utilities.
 */

import { withRetry, type RetryOptions } from './retry.ts';

export interface CommandOptions {
	cwd?: string;
	env?: Record<string, string>;
	stdout?: 'inherit' | 'piped' | 'null';
	stderr?: 'inherit' | 'piped' | 'null';
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
): Promise<Deno.CommandOutput> {
	const command = new Deno.Command(cmd, {
		args,
		cwd: options?.cwd,
		env: options?.env ? { ...Deno.env.toObject(), ...options.env } : undefined,
		stdout: options?.stdout ?? 'inherit',
		stderr: options?.stderr ?? 'inherit',
	});

	const result = await command.output();
	if (!result.success) {
		throw new Error(`Command "${cmd}" exited with code ${result.code}`);
	}
	return result;
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
): Promise<Deno.CommandOutput> {
	return withRetry(() => runCommand(cmd, args, cmdOptions), retryOptions);
}
