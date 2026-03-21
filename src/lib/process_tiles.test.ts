import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StepContext } from './framework.ts';
import { skip } from './pipeline.ts';
import { processTiles } from './process_tiles.ts';

describe('processTiles', () => {
	let ctx: StepContext;
	let testDir: string;

	beforeEach(() => {
		testDir = join(tmpdir(), `process-tiles-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		const dataDir = join(testDir, 'data');
		const tempDir = join(testDir, 'temp');
		mkdirSync(dataDir, { recursive: true });
		mkdirSync(tempDir, { recursive: true });
		ctx = { name: 'test', projDir: testDir, dataDir, tempDir };
	});

	afterEach(async () => {
		const { rmSync } = await import('node:fs');
		rmSync(testDir, { recursive: true, force: true });
	});

	it('single-stage: downloads to dest', async () => {
		await processTiles(['a', 'b', 'c'], ctx, {
			dest: (item) => `${item}.txt`,
			download: {
				concurrency: 2,
				fn: async (item, dest) => {
					writeFileSync(dest, item);
					return skip('downloaded');
				},
			},
			labels: ['downloaded', 'skipped'],
			minFiles: { pattern: '*.txt', count: 2 },
		});

		const tilesDir = join(ctx.dataDir, 'tiles');
		expect(readFileSync(join(tilesDir, 'a.txt'), 'utf-8')).toBe('a');
		expect(readFileSync(join(tilesDir, 'b.txt'), 'utf-8')).toBe('b');
		expect(readFileSync(join(tilesDir, 'c.txt'), 'utf-8')).toBe('c');
	});

	it('two-stage: download then convert', async () => {
		await processTiles(['x', 'y'], ctx, {
			dest: (item) => `${item}.out`,
			download: {
				concurrency: 2,
				fn: async (item) => {
					return { value: item.toUpperCase() };
				},
			},
			convert: {
				concurrency: 1,
				fn: async (data, dest) => {
					writeFileSync(dest, data.value);
					return 'converted';
				},
			},
			labels: ['converted', 'skipped'],
			minFiles: { pattern: '*.out', count: 1 },
		});

		const tilesDir = join(ctx.dataDir, 'tiles');
		expect(readFileSync(join(tilesDir, 'x.out'), 'utf-8')).toBe('X');
		expect(readFileSync(join(tilesDir, 'y.out'), 'utf-8')).toBe('Y');
	});

	it('skips existing dest files', async () => {
		const tilesDir = join(ctx.dataDir, 'tiles');
		mkdirSync(tilesDir, { recursive: true });
		writeFileSync(join(tilesDir, 'a.txt'), 'existing');

		let downloadCount = 0;
		await processTiles(['a', 'b'], ctx, {
			dest: (item) => `${item}.txt`,
			download: {
				concurrency: 2,
				fn: async (item, dest) => {
					downloadCount++;
					writeFileSync(dest, item);
					return skip('downloaded');
				},
			},
			labels: ['downloaded', 'skipped'],
			minFiles: { pattern: '*.txt', count: 1 },
		});

		expect(downloadCount).toBe(1);
		expect(readFileSync(join(tilesDir, 'a.txt'), 'utf-8')).toBe('existing');
	});

	it('skips existing skip files', async () => {
		const tilesDir = join(ctx.dataDir, 'tiles');
		mkdirSync(tilesDir, { recursive: true });
		writeFileSync(join(tilesDir, 'a.skip'), '');

		let downloadCount = 0;
		await processTiles(['a', 'b'], ctx, {
			dest: (item) => `${item}.txt`,
			skipFile: (item) => `${item}.skip`,
			download: {
				concurrency: 2,
				fn: async (item, dest) => {
					downloadCount++;
					writeFileSync(dest, item);
					return skip('downloaded');
				},
			},
			labels: ['downloaded', 'skipped'],
			minFiles: { pattern: '*.txt', count: 1 },
		});

		expect(downloadCount).toBe(1);
	});

	it('handles skip() from download callback', async () => {
		await processTiles(['a', 'b', 'c'], ctx, {
			dest: (item) => `${item}.txt`,
			download: {
				concurrency: 2,
				fn: async (item, dest) => {
					if (item === 'b') return skip('empty');
					writeFileSync(dest, item);
					return skip('downloaded');
				},
			},
			labels: ['downloaded', 'skipped', 'empty'],
			minFiles: { pattern: '*.txt', count: 1 },
		});

		const tilesDir = join(ctx.dataDir, 'tiles');
		expect(existsSync(join(tilesDir, 'a.txt'))).toBe(true);
		expect(existsSync(join(tilesDir, 'b.txt'))).toBe(false);
		expect(existsSync(join(tilesDir, 'c.txt'))).toBe(true);
	});

	it('handles skip() in two-stage download', async () => {
		await processTiles(['a', 'b', 'c'], ctx, {
			dest: (item) => `${item}.out`,
			download: {
				concurrency: 2,
				fn: async (item) => {
					if (item === 'b') return skip('empty');
					return { value: item };
				},
			},
			convert: {
				concurrency: 1,
				fn: async (data, dest) => {
					writeFileSync(dest, data.value);
					return 'converted';
				},
			},
			labels: ['converted', 'skipped', 'empty'],
			minFiles: { pattern: '*.out', count: 1 },
		});

		const tilesDir = join(ctx.dataDir, 'tiles');
		expect(existsSync(join(tilesDir, 'a.out'))).toBe(true);
		expect(existsSync(join(tilesDir, 'b.out'))).toBe(false);
		expect(existsSync(join(tilesDir, 'c.out'))).toBe(true);
	});

	it('filters null from download in two-stage mode', async () => {
		await processTiles(['a', 'b', 'c'], ctx, {
			dest: (item) => `${item}.out`,
			download: {
				concurrency: 2,
				fn: async (item) => {
					if (item === 'b') return null;
					return { value: item };
				},
			},
			convert: {
				concurrency: 1,
				fn: async (data, dest) => {
					writeFileSync(dest, data.value);
					return 'converted';
				},
			},
			labels: ['converted', 'skipped'],
			minFiles: { pattern: '*.out', count: 1 },
		});

		const tilesDir = join(ctx.dataDir, 'tiles');
		expect(existsSync(join(tilesDir, 'a.out'))).toBe(true);
		expect(existsSync(join(tilesDir, 'b.out'))).toBe(false);
	});

	it('creates tilesDir automatically', async () => {
		const tilesDir = join(ctx.dataDir, 'tiles');
		expect(existsSync(tilesDir)).toBe(false);

		await processTiles(['a'], ctx, {
			dest: (item) => `${item}.txt`,
			download: {
				concurrency: 1,
				fn: async (item, dest) => {
					writeFileSync(dest, item);
					return skip('downloaded');
				},
			},
			labels: ['downloaded', 'skipped'],
			minFiles: { pattern: '*.txt', count: 1 },
		});

		expect(existsSync(tilesDir)).toBe(true);
	});
});
