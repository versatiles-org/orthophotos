/**
 * Unified command execution utilities.
 */

import { spawn } from 'node:child_process';
import { type RetryOptions, withRetry } from './retry.ts';
import { createWriteStream, renameSync, rmSync, statSync } from 'node:fs';
import { sleep } from './delay.ts';
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

		child.on('error', (err) =>
			reject(
				new Error(
					[
						`Failed to start command: ${cmd} ${args.join(' ')}`,
						`${err.message}`,
						`${Buffer.concat(stdoutChunks).toString()}`,
						`${Buffer.concat(stderrChunks).toString()}`,
					].join('\n'),
				),
			),
		);

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
 * Formats an error (and its `cause` chain) as a multi-line string.
 * Useful for surfacing stderr captured by `runCommand` when a wrapped error propagates up.
 */
export function formatErrorChain(err: unknown): string {
	const parts: string[] = [];
	let cur: unknown = err;
	while (cur instanceof Error) {
		parts.push(cur.message);
		cur = (cur as { cause?: unknown }).cause;
	}
	if (cur !== undefined && !(cur instanceof Error)) parts.push(String(cur));
	return parts.join('\n  Caused by: ');
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
	/** Extra HTTP request headers (e.g. `{ Accept: 'application/json' }`). */
	headers?: Record<string, string>;
}

/**
 * Downloads a file from a URL using curl.
 * Downloads to a temporary file first, then renames to avoid partial files.
 */
export async function downloadFile(url: string, dest: string, options?: DownloadOptions): Promise<void> {
	const tmp = `${dest}.tmp`;
	const args = ['-sLo', tmp, '--fail'];
	if (options?.continue) args.push('-C', '-');
	if (options?.headers) {
		for (const [k, v] of Object.entries(options.headers)) args.push('-H', `${k}: ${v}`);
	}
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
	/** Sleep this many ms before each request (incl. HEADs). Use to respect rate limits. */
	intervalMs?: number;
	/** Wrap each download in `withRetry` (so transient 429/5xx are retried with backoff). */
	retry?: RetryOptions;
}

/**
 * Fetches the `Content-Length` of a URL via a HEAD request. Returns `0` if not reported.
 */
async function fetchContentLength(url: string): Promise<number> {
	const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
	if (!res.ok) throw new Error(`HEAD ${url} failed: ${res.status} ${res.statusText}`);
	const len = res.headers.get('content-length');
	return len ? Number(len) : 0;
}

/**
 * Streams a download to `dest`, atomically renaming from `${dest}.tmp` on success.
 * Calls `onBytes(n)` for each chunk received so callers can update progress continuously.
 */
async function streamDownload(
	url: string,
	dest: string,
	onBytes: (n: number) => void,
	options?: DownloadOptions,
): Promise<void> {
	const tmp = `${dest}.tmp`;
	const resumeFrom = options?.continue ? statSizeOrZero(tmp) : 0;

	const headers: Record<string, string> = {};
	if (resumeFrom > 0) headers['Range'] = `bytes=${resumeFrom}-`;

	const res = await fetch(url, { headers, redirect: 'follow' });
	if (!res.ok) throw new Error(`Download failed: ${url} (${res.status} ${res.statusText})`);
	if (!res.body) throw new Error(`No response body: ${url}`);

	const append = resumeFrom > 0 && res.status === 206;
	const out = createWriteStream(tmp, { flags: append ? 'a' : 'w' });
	try {
		for await (const chunk of res.body) {
			const buf = chunk as Uint8Array;
			if (!out.write(buf)) await new Promise<void>((resolve) => out.once('drain', resolve));
			onBytes(buf.byteLength);
		}
		await new Promise<void>((resolve, reject) => {
			out.once('finish', resolve);
			out.once('error', reject);
			out.end();
		});
	} catch (err) {
		out.destroy();
		throw err;
	}

	if (options?.minSize) {
		const size = statSync(tmp).size;
		if (size < options.minSize) {
			rmSync(tmp, { force: true });
			throw new Error(`Downloaded file is too small (${size} bytes, expected >= ${options.minSize}): ${url}`);
		}
	}
	renameSync(tmp, dest);
}

function statSizeOrZero(path: string): number {
	try {
		return statSync(path).size;
	} catch {
		return 0;
	}
}

/**
 * Downloads multiple files sequentially, optionally rendering a progress bar.
 * - `progress: 'count'` ticks once per completed file.
 * - `progress: 'size'` streams each download and updates the bar continuously as bytes arrive.
 *   Missing `item.size` values are resolved via HEAD requests up front.
 */
export async function downloadFiles(items: DownloadFilesItem[], options?: DownloadFilesOptions): Promise<void> {
	const mode = options?.progress;
	const interval = options?.intervalMs;

	const sizes = new Map<DownloadFilesItem, number>();
	if (mode === 'size') {
		for (const item of items) {
			if (item.size === undefined) {
				if (interval) await sleep(interval);
				sizes.set(item, await fetchContentLength(item.url));
			} else {
				sizes.set(item, item.size);
			}
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

	const runOnce = async (item: DownloadFilesItem): Promise<void> => {
		if (mode === 'size') {
			await streamDownload(item.url, item.dest, (n) => tracker!.tick('bytes', n), options?.download);
		} else {
			await downloadFile(item.url, item.dest, options?.download);
		}
	};

	for (const item of items) {
		if (interval) await sleep(interval);
		if (options?.retry) await withRetry(() => runOnce(item), options.retry);
		else await runOnce(item);
		if (mode === 'count') tracker!.tick('downloaded');
	}

	tracker?.done();
}
