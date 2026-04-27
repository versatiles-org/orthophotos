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
		status: 'scraping' as const,
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
			convertLimit: { concurrency: 1 },
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
			convertLimit: { concurrency: 1 },
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
			convertLimit: { concurrency: 1 },
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

	describe('tempFile cleanup', () => {
		it('removes registered files after successful convert', async () => {
			const aTemp = join(ctx.tempDir, 'a.tmp');
			const bTemp = join(ctx.tempDir, 'b.tmp');

			await runTileRegion(ctx, {
				name: 'test/cleanup-success',
				meta: baseMeta,
				init: () => [{ id: 'a' }, { id: 'b' }],
				download: async (item, tileCtx) => {
					const tmp = tileCtx.tempFile(join(tileCtx.tempDir, `${item.id}.tmp`));
					writeFileSync(tmp, 'x');
					return { tmp };
				},
				convert: async ({ tmp }, { dest }) => {
					expect(existsSync(tmp)).toBe(true);
					writeFileSync(dest, 'ok');
				},
				minFiles: 0,
			});

			expect(existsSync(aTemp)).toBe(false);
			expect(existsSync(bTemp)).toBe(false);
		});

		it('removes registered files when download returns empty/invalid', async () => {
			await runTileRegion(ctx, {
				name: 'test/cleanup-skip',
				meta: baseMeta,
				init: () => [{ id: 'e' }, { id: 'i' }, { id: 'ok' }],
				download: async (item, tileCtx) => {
					const tmp = tileCtx.tempFile(join(tileCtx.tempDir, `${item.id}.tmp`));
					writeFileSync(tmp, 'x');
					if (item.id === 'e') return 'empty';
					if (item.id === 'i') return 'invalid';
					return { tmp };
				},
				convert: async ({ tmp }, { dest }) => {
					writeFileSync(dest, tmp);
				},
				minFiles: 0,
			});

			expect(existsSync(join(ctx.tempDir, 'e.tmp'))).toBe(false);
			expect(existsSync(join(ctx.tempDir, 'i.tmp'))).toBe(false);
			expect(existsSync(join(ctx.tempDir, 'ok.tmp'))).toBe(false);
		});

		it('removes registered files when download throws', async () => {
			const tmpPath = join(ctx.tempDir, 'fail.tmp');

			await expect(
				runTileRegion(ctx, {
					name: 'test/cleanup-download-throw',
					meta: baseMeta,
					init: () => [{ id: 'fail' }],
					download: async (_item, tileCtx) => {
						const tmp = tileCtx.tempFile(join(tileCtx.tempDir, 'fail.tmp'));
						writeFileSync(tmp, 'x');
						throw new Error('boom');
					},
					convert: async () => {},
					minFiles: 0,
				}),
			).rejects.toThrow('boom');

			expect(existsSync(tmpPath)).toBe(false);
		});

		it('removes registered files when convert throws', async () => {
			const tmpPath = join(ctx.tempDir, 'cv.tmp');

			await expect(
				runTileRegion(ctx, {
					name: 'test/cleanup-convert-throw',
					meta: baseMeta,
					init: () => [{ id: 'cv' }],
					download: async (_item, tileCtx) => {
						const tmp = tileCtx.tempFile(join(tileCtx.tempDir, 'cv.tmp'));
						writeFileSync(tmp, 'x');
						return { tmp };
					},
					convert: async () => {
						throw new Error('convert-boom');
					},
					minFiles: 0,
				}),
			).rejects.toThrow('convert-boom');

			expect(existsSync(tmpPath)).toBe(false);
		});

		it('tempFile returns the path unchanged', async () => {
			let observed = '';
			await runTileRegion(ctx, {
				name: 'test/cleanup-return',
				meta: baseMeta,
				init: () => [{ id: 'r' }],
				download: async (_item, tileCtx) => {
					const p = join(tileCtx.tempDir, 'r.tmp');
					observed = tileCtx.tempFile(p);
					writeFileSync(observed, 'x');
					return { p: observed };
				},
				convert: async ({ p }, { dest }) => {
					writeFileSync(dest, p);
				},
				minFiles: 0,
			});

			expect(observed).toBe(join(ctx.tempDir, 'r.tmp'));
			expect(existsSync(observed)).toBe(false);
		});
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
