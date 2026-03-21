import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StepContext } from './framework.ts';
import { tileSteps } from './process_tiles.ts';

/** Helper: run tileSteps config through the generated step */
async function runTileSteps<T extends { id: string; [k: string]: unknown }, D>(
	ctx: StepContext,
	options: Parameters<typeof tileSteps<T, D>>[0],
): Promise<void> {
	const steps = tileSteps(options);
	for (const s of steps) await s.run(ctx);
}

describe('tileSteps', () => {
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

	it('returns a Step array with a download-tiles step', () => {
		const steps = tileSteps({
			init: () => [],
			download: { concurrency: 1, fn: async () => {} },
			minFiles: 0,
		});
		expect(steps).toHaveLength(1);
		expect(steps[0].name).toBe('download-tiles');
	});

	it('single-stage: downloads to dest', async () => {
		await runTileSteps(ctx, {
			init: () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
			download: {
				concurrency: 2,
				fn: async (item, { dest }) => {
					writeFileSync(dest, item.id);
				},
			},
			minFiles: 0,
		});

		const tilesDir = join(ctx.dataDir, 'tiles');
		expect(readFileSync(join(tilesDir, 'a.versatiles'), 'utf-8')).toBe('a');
		expect(readFileSync(join(tilesDir, 'b.versatiles'), 'utf-8')).toBe('b');
		expect(readFileSync(join(tilesDir, 'c.versatiles'), 'utf-8')).toBe('c');
	});

	it('two-stage: download then convert', async () => {
		await runTileSteps(ctx, {
			init: () => [{ id: 'x' }, { id: 'y' }],
			download: {
				concurrency: 2,
				fn: async (item) => {
					return { value: item.id.toUpperCase() };
				},
			},
			convert: {
				concurrency: 1,
				fn: async (data, { dest }) => {
					writeFileSync(dest, data.value);
				},
			},
			minFiles: 0,
		});

		const tilesDir = join(ctx.dataDir, 'tiles');
		expect(readFileSync(join(tilesDir, 'x.versatiles'), 'utf-8')).toBe('X');
		expect(readFileSync(join(tilesDir, 'y.versatiles'), 'utf-8')).toBe('Y');
	});

	it('skips existing dest files', async () => {
		const tilesDir = join(ctx.dataDir, 'tiles');
		mkdirSync(tilesDir, { recursive: true });
		writeFileSync(join(tilesDir, 'a.versatiles'), 'existing');

		let downloadCount = 0;
		await runTileSteps(ctx, {
			init: () => [{ id: 'a' }, { id: 'b' }],
			download: {
				concurrency: 2,
				fn: async (item, { dest }) => {
					downloadCount++;
					writeFileSync(dest, item.id);
				},
			},
			minFiles: 0,
		});

		expect(downloadCount).toBe(1);
		expect(readFileSync(join(tilesDir, 'a.versatiles'), 'utf-8')).toBe('existing');
	});

	it('skips existing skip files', async () => {
		const tilesDir = join(ctx.dataDir, 'tiles');
		mkdirSync(tilesDir, { recursive: true });
		writeFileSync(join(tilesDir, 'a.skip'), '');

		let downloadCount = 0;
		await runTileSteps(ctx, {
			init: () => [{ id: 'a' }, { id: 'b' }],
			download: {
				concurrency: 2,
				fn: async (item, { dest }) => {
					downloadCount++;
					writeFileSync(dest, item.id);
				},
			},
			minFiles: 0,
		});

		expect(downloadCount).toBe(1);
	});

	it('handles empty return from download callback in two-stage mode', async () => {
		await runTileSteps(ctx, {
			init: () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
			download: {
				concurrency: 2,
				fn: async (item) => {
					if (item.id === 'b') return 'empty';
					return { value: item.id };
				},
			},
			convert: {
				concurrency: 1,
				fn: async (data, { dest }) => {
					writeFileSync(dest, data.value);
				},
			},
			minFiles: 0,
		});

		const tilesDir = join(ctx.dataDir, 'tiles');
		expect(existsSync(join(tilesDir, 'a.versatiles'))).toBe(true);
		expect(existsSync(join(tilesDir, 'b.versatiles'))).toBe(false);
		expect(existsSync(join(tilesDir, 'c.versatiles'))).toBe(true);
	});

	it('handles empty return from download callback in single-stage mode', async () => {
		await runTileSteps(ctx, {
			init: () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
			download: {
				concurrency: 2,
				fn: async (item, { dest }) => {
					if (item.id === 'b') return 'empty';
					writeFileSync(dest, item.id);
				},
			},
			minFiles: 0,
		});

		const tilesDir = join(ctx.dataDir, 'tiles');
		expect(existsSync(join(tilesDir, 'a.versatiles'))).toBe(true);
		expect(existsSync(join(tilesDir, 'b.versatiles'))).toBe(false);
		expect(existsSync(join(tilesDir, 'c.versatiles'))).toBe(true);
	});

	it('creates tilesDir automatically', async () => {
		const tilesDir = join(ctx.dataDir, 'tiles');
		expect(existsSync(tilesDir)).toBe(false);

		await runTileSteps(ctx, {
			init: () => [{ id: 'a' }],
			download: {
				concurrency: 1,
				fn: async (item, { dest }) => {
					writeFileSync(dest, item.id);
				},
			},
			minFiles: 0,
		});

		expect(existsSync(tilesDir)).toBe(true);
	});

	it('provides skipDest in context', async () => {
		await runTileSteps(ctx, {
			init: () => [{ id: 'a' }, { id: 'b' }],
			download: {
				concurrency: 1,
				fn: async (item, { dest, skipDest }) => {
					if (item.id === 'a') {
						writeFileSync(skipDest, '');
						return 'empty';
					}
					writeFileSync(dest, item.id);
				},
			},
			minFiles: 1,
		});

		const tilesDir = join(ctx.dataDir, 'tiles');
		expect(existsSync(join(tilesDir, 'a.skip'))).toBe(true);
		expect(existsSync(join(tilesDir, 'b.versatiles'))).toBe(true);
	});

	it('async init receives StepContext', async () => {
		writeFileSync(join(ctx.tempDir, 'items.json'), JSON.stringify([{ id: 'p' }, { id: 'q' }]));

		await runTileSteps(ctx, {
			init: async (stepCtx) => {
				const { readFile } = await import('node:fs/promises');
				return JSON.parse(await readFile(join(stepCtx.tempDir, 'items.json'), 'utf-8')) as {
					id: string;
				}[];
			},
			download: {
				concurrency: 1,
				fn: async (item, { dest }) => {
					writeFileSync(dest, item.id);
				},
			},
			minFiles: 0,
		});

		const tilesDir = join(ctx.dataDir, 'tiles');
		expect(existsSync(join(tilesDir, 'p.versatiles'))).toBe(true);
		expect(existsSync(join(tilesDir, 'q.versatiles'))).toBe(true);
	});
});
