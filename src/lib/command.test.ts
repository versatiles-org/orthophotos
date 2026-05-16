import { expect, test } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { downloadFiles, runCommand, runCommandWithRetry } from './command.ts';

test('runCommand - executes successful command', async () => {
	const result = await runCommand('echo', ['hello'], { stdout: 'piped' });
	expect(result.success).toBe(true);
	expect(result.code).toBe(0);
});

test('runCommand - captures stdout when piped', async () => {
	const result = await runCommand('echo', ['test output'], { stdout: 'piped' });
	const output = new TextDecoder().decode(result.stdout);
	expect(output).toContain('test output');
});

test('runCommand - throws on non-zero exit code', async () => {
	await expect(runCommand('false', [])).rejects.toThrow('Command failed');
});

test('runCommand - respects cwd option', async () => {
	const result = await runCommand('pwd', [], { cwd: '/tmp', stdout: 'piped' });
	const output = new TextDecoder().decode(result.stdout).trim();
	// On macOS /tmp is a symlink to /private/tmp
	expect(output === '/tmp' || output === '/private/tmp').toBe(true);
});

test('runCommand - passes environment variables', async () => {
	const result = await runCommand('sh', ['-c', 'echo $TEST_VAR'], {
		env: { TEST_VAR: 'test_value' },
		stdout: 'piped',
	});
	const output = new TextDecoder().decode(result.stdout).trim();
	expect(output).toBe('test_value');
});

test('runCommand - suppresses output with null options', async () => {
	// This should complete without throwing
	const result = await runCommand('echo', ['suppressed'], {
		stdout: 'null',
		stderr: 'null',
	});
	expect(result.success).toBe(true);
});

test('runCommandWithRetry - succeeds on first attempt', async () => {
	const result = await runCommandWithRetry(
		'echo',
		['success'],
		{ maxAttempts: 3, initialDelayMs: 10 },
		{ stdout: 'piped' },
	);
	expect(result.success).toBe(true);
});

test('runCommandWithRetry - throws after max attempts on persistent failure', async () => {
	await expect(runCommandWithRetry('false', [], { maxAttempts: 2, initialDelayMs: 10 })).rejects.toThrow(
		'Command failed',
	);
});

async function withTestServer<T>(routes: Record<string, Buffer>, fn: (baseUrl: string) => Promise<T>): Promise<T> {
	const server: Server = createServer((req, res) => {
		const body = routes[req.url ?? ''];
		if (!body) {
			res.statusCode = 404;
			res.end();
			return;
		}
		res.setHeader('Content-Length', body.length);
		if (req.method === 'HEAD') {
			res.end();
			return;
		}
		res.end(body);
	});
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const addr = server.address();
	const port = typeof addr === 'object' && addr ? addr.port : 0;
	try {
		return await fn(`http://127.0.0.1:${port}`);
	} finally {
		await new Promise<void>((resolve) => server.close(() => resolve()));
	}
}

test('downloadFiles - downloads all files sequentially', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'downloadFiles-'));
	try {
		const routes = {
			'/a.bin': Buffer.from('hello'),
			'/b.bin': Buffer.from('world!'),
		};
		await withTestServer(routes, async (base) => {
			await downloadFiles([
				{ url: `${base}/a.bin`, dest: join(dir, 'a.bin') },
				{ url: `${base}/b.bin`, dest: join(dir, 'b.bin') },
			]);
		});
		expect(readFileSync(join(dir, 'a.bin'), 'utf-8')).toBe('hello');
		expect(readFileSync(join(dir, 'b.bin'), 'utf-8')).toBe('world!');
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('downloadFiles - works with count-based progress', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'downloadFiles-'));
	try {
		const routes = { '/x': Buffer.from('x'), '/y': Buffer.from('yy') };
		await withTestServer(routes, async (base) => {
			await downloadFiles(
				[
					{ url: `${base}/x`, dest: join(dir, 'x') },
					{ url: `${base}/y`, dest: join(dir, 'y') },
				],
				{ progress: 'count' },
			);
		});
		expect(statSync(join(dir, 'x')).size).toBe(1);
		expect(statSync(join(dir, 'y')).size).toBe(2);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('downloadFiles - works with size-based progress', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'downloadFiles-'));
	try {
		const routes = { '/x': Buffer.from('abc'), '/y': Buffer.from('defgh') };
		await withTestServer(routes, async (base) => {
			await downloadFiles(
				[
					{ url: `${base}/x`, dest: join(dir, 'x'), size: 3 },
					{ url: `${base}/y`, dest: join(dir, 'y'), size: 5 },
				],
				{ progress: 'size' },
			);
		});
		expect(statSync(join(dir, 'x')).size).toBe(3);
		expect(statSync(join(dir, 'y')).size).toBe(5);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('downloadFiles - size mode streams bytes continuously', async () => {
	// Serve a chunked response so we can observe progress accumulate mid-file.
	const dir = mkdtempSync(join(tmpdir(), 'downloadFiles-'));
	try {
		const chunks = [Buffer.alloc(1024, 0x61), Buffer.alloc(1024, 0x62), Buffer.alloc(1024, 0x63)];
		const total = chunks.reduce((s, c) => s + c.length, 0);

		const server: Server = createServer(async (req, res) => {
			res.setHeader('Content-Length', total);
			if (req.method === 'HEAD') return res.end();
			for (const c of chunks) {
				res.write(c);
				await new Promise((r) => setTimeout(r, 20));
			}
			res.end();
		});
		await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
		const port = (server.address() as { port: number }).port;

		try {
			await downloadFiles([{ url: `http://127.0.0.1:${port}/x`, dest: join(dir, 'x') }], { progress: 'size' });
			expect(statSync(join(dir, 'x')).size).toBe(total);
		} finally {
			await new Promise<void>((r) => server.close(() => r()));
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('downloadFiles - size mode fetches missing sizes via HEAD', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'downloadFiles-'));
	try {
		const routes = { '/x': Buffer.from('abc'), '/y': Buffer.from('defghij') };
		await withTestServer(routes, async (base) => {
			await downloadFiles(
				[
					{ url: `${base}/x`, dest: join(dir, 'x') },
					{ url: `${base}/y`, dest: join(dir, 'y'), size: 7 },
				],
				{ progress: 'size' },
			);
		});
		expect(statSync(join(dir, 'x')).size).toBe(3);
		expect(statSync(join(dir, 'y')).size).toBe(7);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('downloadFiles - propagates download errors', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'downloadFiles-'));
	try {
		await withTestServer({ '/ok': Buffer.from('ok') }, async (base) => {
			await expect(
				downloadFiles([
					{ url: `${base}/ok`, dest: join(dir, 'ok') },
					{ url: `${base}/missing`, dest: join(dir, 'missing') },
				]),
			).rejects.toThrow();
		});
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('downloadFiles - size mode: a mid-stream abort rejects instead of crashing', async () => {
	// Regression test: streamDownload used to leave its WriteStream without an
	// 'error' listener during streaming, so a connection dropped mid-write
	// surfaced as an unhandled 'error' (ERR_STREAM_DESTROYED) and killed the
	// process. The download must instead reject so `retry` can catch it — the
	// test process surviving to observe the rejection is the proof.
	const dir = mkdtempSync(join(tmpdir(), 'downloadFiles-'));
	try {
		const total = 64 * 1024;
		const server: Server = createServer((req, res) => {
			res.setHeader('Content-Length', total);
			if (req.method === 'HEAD') return res.end();
			// Send a fraction of the promised body, then hard-kill the socket.
			res.write(Buffer.alloc(8 * 1024, 0x61));
			setTimeout(() => res.socket?.destroy(), 10);
		});
		await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
		const port = (server.address() as { port: number }).port;
		try {
			await expect(
				downloadFiles([{ url: `http://127.0.0.1:${port}/x`, dest: join(dir, 'x'), size: total }], {
					progress: 'size',
					retry: { maxAttempts: 2, initialDelayMs: 1 },
				}),
			).rejects.toThrow();
		} finally {
			await new Promise<void>((r) => server.close(() => r()));
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test('downloadFiles - size mode: resume picks up after a mid-stream abort', async () => {
	// First request aborts partway; the retry sends `Range:` and the server
	// completes the file. The assembled file must equal the full payload.
	const dir = mkdtempSync(join(tmpdir(), 'downloadFiles-'));
	try {
		const payload = Buffer.alloc(40 * 1024).map((_, i) => i & 0xff);
		let attempt = 0;
		const server: Server = createServer((req, res) => {
			if (req.method === 'HEAD') {
				res.setHeader('Content-Length', payload.length);
				return res.end();
			}
			const range = /^bytes=(\d+)-/.exec(req.headers.range ?? '');
			const from = range ? Number(range[1]) : 0;
			attempt++;
			if (attempt === 1) {
				// First attempt: send a slice, then kill the connection.
				res.setHeader('Content-Length', payload.length);
				res.write(payload.subarray(0, 12 * 1024));
				setTimeout(() => res.socket?.destroy(), 10);
				return;
			}
			// Retry: honour the Range header and serve the rest.
			res.statusCode = from > 0 ? 206 : 200;
			res.setHeader('Content-Length', payload.length - from);
			res.end(payload.subarray(from));
		});
		await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
		const port = (server.address() as { port: number }).port;
		try {
			await downloadFiles([{ url: `http://127.0.0.1:${port}/x`, dest: join(dir, 'x'), size: payload.length }], {
				progress: 'size',
				download: { continue: true },
				retry: { maxAttempts: 5, initialDelayMs: 1 },
			});
			expect(readFileSync(join(dir, 'x')).equals(payload)).toBe(true);
		} finally {
			await new Promise<void>((r) => server.close(() => r()));
		}
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
