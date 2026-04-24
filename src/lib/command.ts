/**
 * Unified command execution utilities.
 */

import { spawn } from 'node:child_process';
import { type RetryOptions, withRetry } from './retry.ts';
import { renameSync, rmSync, statSync } from 'node:fs';
import { createProgress } from './progress.ts';

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

export interface DownloadFilesItem {
	url: string;
	dest: string;
	/** File size in bytes. Used when `progress: 'size'`; fetched via HEAD if omitted. */
	size?: number;
}

export interface DownloadFilesOptions {
	/** Show a progress bar: `'count'` weights each file equally, `'size'` weights by bytes (uses `item.size`). */
	progress?: 'count' | 'size';
	/** Title prefix shown in the terminal window title (passed through to the progress bar). */
	title?: string;
	/** Options forwarded to each underlying `downloadFile` call. */
	download?: DownloadOptions;
}

/**
 * Fetches the `Content-Length` of a URL via `curl -ILsf`. Returns `0` if not reported.
 */
async function fetchContentLength(url: string): Promise<number> {
	const result = await runCommand('curl', ['-ILsf', url], { stdout: 'piped', stderr: 'piped' });
	const headers = new TextDecoder().decode(result.stdout);
	let size = 0;
	for (const line of headers.split(/\r?\n/)) {
		const m = /^content-length:\s*(\d+)\s*$/i.exec(line);
		if (m) size = Number(m[1]);
	}
	return size;
}

/**
 * Downloads multiple files sequentially, optionally rendering a progress bar.
 * For size-weighted progress, any item without a `size` is resolved via a HEAD request first.
 */
export async function downloadFiles(items: DownloadFilesItem[], options?: DownloadFilesOptions): Promise<void> {
	const mode = options?.progress;

	const sizes = new Map<DownloadFilesItem, number>();
	if (mode === 'size') {
		for (const item of items) {
			sizes.set(item, item.size ?? (await fetchContentLength(item.url)));
		}
	}

	const tracker =
		mode === 'count'
			? createProgress(items.length, { labels: ['downloaded'], title: options?.title })
			: mode === 'size'
				? createProgress(
						items.reduce((s, it) => s + (sizes.get(it) ?? 0), 0),
						{ labels: ['bytes'], title: options?.title },
					)
				: undefined;

	for (const item of items) {
		await downloadFile(item.url, item.dest, options?.download);
		if (mode === 'count') tracker!.tick('downloaded');
		else if (mode === 'size') tracker!.tick('bytes', sizes.get(item) ?? 0);
	}

	tracker?.done();
}
