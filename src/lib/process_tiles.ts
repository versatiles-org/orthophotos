/**
 * High-level tile processing helper built on top of `pipeline`.
 *
 * Handles the boilerplate that every region repeats:
 * tilesDir setup, shuffle, skip checks, progress, and expectMinFiles.
 *
 * Usage via defineTileRegion() — returns a RegionPipeline:
 *
 *   export default defineTileRegion({
 *     name: 'de/example',
 *     meta: { status: 'success', ... },
 *     init: () => generateCoords(),
 *     download: async ({ id }, { dest, tempDir }) => {
 *       await downloadFile(url, dest);
 *     },
 *     minFiles: 50,
 *   });
 */

import { existsSync, mkdirSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { shuffle } from './array.ts';
import { CONCURRENCY } from './concurrent.ts';
import { defineRegion, step, type RegionPipeline, type StepContext } from './framework.ts';
import { pipeline, skip } from './pipeline.ts';
import { DownloadErrors, expectMinFiles } from './validators.ts';

/** Items must have an `id` property used to derive output and skip-file paths. */
export interface TileItem {
	id: string;
	[key: string]: unknown;
}

/** Context passed to download/convert callbacks */
export interface TileContext {
	/** Full path to the output file (`${id}.versatiles`) */
	dest: string;
	/** Full path to the skip file (`${id}.skip`) */
	skipDest: string;
	/** Directory for temporary files */
	tempDir: string;
	/** Directory where output tiles live */
	tilesDir: string;
	/** Collector for invalid download errors */
	errors: DownloadErrors;
}

export interface TileRegionOptions<T extends TileItem, D = void> {
	/** Region identifier (e.g. 'de/thueringen') */
	name: string;
	/** Region metadata */
	meta: Parameters<typeof defineRegion>[1];
	/** Generate the items to process */
	init: (ctx: StepContext) => T[] | Promise<T[]>;
	/** Download concurrency (default: CONCURRENCY = 4) */
	downloadConcurrency?: number;
	/** Download callback */
	download: (item: T, ctx: TileContext) => Promise<D | 'empty' | 'invalid' | void>;
	/** Convert concurrency (default: Math.max(1, Math.floor(availableParallelism() / 4))) */
	convertConcurrency?: number;
	/** Convert callback (optional). When present, download returns D, convert receives it. */
	convert?: (data: Exclude<D, 'empty' | 'invalid' | void>, ctx: TileContext) => Promise<void>;
	/** Minimum number of *.versatiles output files required */
	minFiles: number;
}

/**
 * Define a tile-based region with a flat config.
 * Returns a RegionPipeline ready for export.
 */
export function defineTileRegion<T extends TileItem, D>(options: TileRegionOptions<T, D>): RegionPipeline {
	return defineRegion(options.name, options.meta, [
		step('download-tiles', async (ctx) => {
			const items = await options.init(ctx);
			await processTiles(items, ctx, options);
		}),
	]);
}

const LABELS = ['converted', 'skipped', 'empty', 'invalid'] as const;

type ConvertEnvelope<D> = { data: Exclude<D, 'empty' | 'invalid' | void>; tileCtx: TileContext };

async function processTiles<T extends TileItem, D>(
	items: T[],
	ctx: StepContext,
	options: TileRegionOptions<T, D>,
): Promise<void> {
	const tilesDir = join(ctx.dataDir, 'tiles');
	mkdirSync(tilesDir, { recursive: true });

	const shuffled = shuffle([...items]);
	const errors = new DownloadErrors();

	const makeTileCtx = (item: T): TileContext => ({
		dest: join(tilesDir, `${item.id}.versatiles`),
		skipDest: join(tilesDir, `${item.id}.skip`),
		tempDir: ctx.tempDir,
		tilesDir,
		errors,
	});

	const isSkipped = (item: T): boolean => {
		const tileCtx = makeTileCtx(item);
		return existsSync(tileCtx.dest) || existsSync(tileCtx.skipDest);
	};

	const dlConcurrency = options.downloadConcurrency ?? CONCURRENCY;
	const cvConcurrency = options.convertConcurrency ?? Math.max(1, Math.floor(availableParallelism() / 4));

	if (options.convert) {
		const { download, convert } = options;
		await pipeline(shuffled, { progress: { labels: [...LABELS] } })
			.map(dlConcurrency, async (item: T) => {
				if (isSkipped(item)) return skip('skipped');
				const tileCtx = makeTileCtx(item);
				const result = await download(item, tileCtx);
				if (result === 'empty') return skip('empty');
				if (result === 'invalid') return skip('invalid');
				if (result == null) return null;
				return { data: result, tileCtx } as ConvertEnvelope<D>;
			})
			.forEach(cvConcurrency, async (envelope) => {
				const { data, tileCtx } = envelope as ConvertEnvelope<D>;
				await convert(data, tileCtx);
				return 'converted';
			});
	} else {
		const { download } = options;
		await pipeline(shuffled, { progress: { labels: [...LABELS] } }).forEach(dlConcurrency, async (item: T) => {
			if (isSkipped(item)) return 'skipped';
			const tileCtx = makeTileCtx(item);
			const result = await download(item, tileCtx);
			if (result === 'empty') return 'empty';
			if (result === 'invalid') return 'invalid';
			return 'converted';
		});
	}

	errors.throwIfAny();
	await expectMinFiles(tilesDir, '*.versatiles', options.minFiles);
}
