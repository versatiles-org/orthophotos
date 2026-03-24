import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StepContext } from './framework.ts';
import { defineTileRegion } from './process_tiles.ts';

/** Helper: run defineTileRegion config through the generated pipeline */
async function runTileRegion<T extends { id: string; [k: string]: unknown }, D>(
	ctx: StepContext,
	options: Parameters<typeof defineTileRegion<T, D>>[0],
): Promise<ReturnType<typeof defineTileRegion>> {
	const region = defineTileRegion(options);
	await region.run!(ctx);
	return region;
}

describe('defineTileRegion', () => {
	let ctx: StepContext;
	let testDir: string;

	const baseMeta = {
		status: 'success' as const,
		notes: [],
		license: { name: 'test', url: 'https://example.com', requiresAttribution: false },
		creator: { name: 'test', url: 'https://example.com' },
		date: '2024',
	};

	beforeEach(() => {
		testDir = join(tmpdir(), `process-tiles-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		const dataDir = join(testDir, 'data');
		const tempDir = join(testDir, 'temp');
		mkdirSync(dataDir, { recursive: true });
		mkdirSync(tempDir, { recursive: true });
		ctx = { name: 'test', dataDir, tempDir };
	});

	afterEach(async () => {
		const { rmSync } = await import('node:fs');
		rmSync(testDir, { recursive: true, force: true });
	});

	it('returns a RegionPipeline with a run function', () => {
		const region = defineTileRegion({
			name: 'test/region',
			meta: baseMeta,
			init: () => [],
			download: async () => ({}),
			convert: async () => {},
			minFiles: 0,
		});
		expect(region.run).toBeTypeOf('function');
		expect(region.id).toBe('test/region');
	});

	it('download then convert', async () => {
		await runTileRegion(ctx, {
			name: 'test/two-stage',
			meta: baseMeta,
			init: () => [{ id: 'x' }, { id: 'y' }],
			download: async (item) => {
				return { value: item.id.toUpperCase() };
			},
			convertCores: 1024,
			convert: async (data, { dest }) => {
				writeFileSync(dest, data.value);
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
		await runTileRegion(ctx, {
			name: 'test/skip-dest',
			meta: baseMeta,
			init: () => [{ id: 'a' }, { id: 'b' }],
			download: async (item) => {
				downloadCount++;
				return { value: item.id };
			},
			convert: async (data, { dest }) => {
				writeFileSync(dest, data.value);
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
		await runTileRegion(ctx, {
			name: 'test/skip-files',
			meta: baseMeta,
			init: () => [{ id: 'a' }, { id: 'b' }],
			download: async (item) => {
				downloadCount++;
				return { value: item.id };
			},
			convert: async (data, { dest }) => {
				writeFileSync(dest, data.value);
			},
			minFiles: 0,
		});

		expect(downloadCount).toBe(1);
	});

	it('handles empty return from download callback', async () => {
		await runTileRegion(ctx, {
			name: 'test/empty',
			meta: baseMeta,
			init: () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
			download: async (item) => {
				if (item.id === 'b') return 'empty';
				return { value: item.id };
			},
			convertCores: 1024,
			convert: async (data, { dest }) => {
				writeFileSync(dest, data.value);
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

		await runTileRegion(ctx, {
			name: 'test/auto-dir',
			meta: baseMeta,
			init: () => [{ id: 'a' }],
			download: async (item) => {
				return { value: item.id };
			},
			convert: async (data, { dest }) => {
				writeFileSync(dest, data.value);
			},
			minFiles: 0,
		});

		expect(existsSync(tilesDir)).toBe(true);
	});

	it('provides skipDest in context', async () => {
		await runTileRegion(ctx, {
			name: 'test/skip-dest-ctx',
			meta: baseMeta,
			init: () => [{ id: 'a' }, { id: 'b' }],
			download: async (item, { skipDest }) => {
				if (item.id === 'a') {
					writeFileSync(skipDest, '');
					return 'empty';
				}
				return { value: item.id };
			},
			convert: async (data, { dest }) => {
				writeFileSync(dest, data.value);
			},
			minFiles: 1,
		});

		const tilesDir = join(ctx.dataDir, 'tiles');
		expect(existsSync(join(tilesDir, 'a.skip'))).toBe(true);
		expect(existsSync(join(tilesDir, 'b.versatiles'))).toBe(true);
	});

	it('handles invalid return from download callback', async () => {
		await runTileRegion(ctx, {
			name: 'test/invalid',
			meta: baseMeta,
			init: () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
			download: async (item) => {
				if (item.id === 'b') return 'invalid';
				return { value: item.id };
			},
			convertCores: 1024,
			convert: async (data, { dest }) => {
				writeFileSync(dest, data.value);
			},
			minFiles: 0,
		});

		const tilesDir = join(ctx.dataDir, 'tiles');
		expect(existsSync(join(tilesDir, 'a.versatiles'))).toBe(true);
		expect(existsSync(join(tilesDir, 'b.versatiles'))).toBe(false);
		expect(existsSync(join(tilesDir, 'c.versatiles'))).toBe(true);
	});

	it('throws when errors.add() is called with invalid returns', async () => {
		await expect(
			runTileRegion(ctx, {
				name: 'test/errors-throw',
				meta: baseMeta,
				init: () => [{ id: 'a' }, { id: 'b' }],
				download: async (item, { errors }) => {
					if (item.id === 'b') {
						errors.add('b.tif (https://example.com/b.tif)');
						return 'invalid';
					}
					return { value: item.id };
				},
				convert: async (data, { dest }) => {
					writeFileSync(dest, data.value);
				},
				minFiles: 0,
			}),
		).rejects.toThrow('1 error(s) occurred');
	});

	it('async init receives StepContext', async () => {
		writeFileSync(join(ctx.tempDir, 'items.json'), JSON.stringify([{ id: 'p' }, { id: 'q' }]));

		await runTileRegion(ctx, {
			name: 'test/async-init',
			meta: baseMeta,
			init: async (stepCtx) => {
				const { readFile } = await import('node:fs/promises');
				return JSON.parse(await readFile(join(stepCtx.tempDir, 'items.json'), 'utf-8')) as {
					id: string;
				}[];
			},
			download: async (item) => {
				return { value: item.id };
			},
			convert: async (data, { dest }) => {
				writeFileSync(dest, data.value);
			},
			minFiles: 0,
		});

		const tilesDir = join(ctx.dataDir, 'tiles');
		expect(existsSync(join(tilesDir, 'p.versatiles'))).toBe(true);
		expect(existsSync(join(tilesDir, 'q.versatiles'))).toBe(true);
	});
});
