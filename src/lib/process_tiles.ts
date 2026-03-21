/**
 * High-level tile processing helper built on top of `pipeline`.
 *
 * Handles the boilerplate that every region repeats:
 * tilesDir setup, shuffle, skip checks, progress, and expectMinFiles.
 *
 * Usage via tileSteps() — returns Step[] for defineRegion:
 *
 *   defineRegion('de/example', metadata, tileSteps({
 *     init: () => generateCoords(),
 *     download: { concurrency: 4, fn: async ({ id }, { dest, tempDir }) => {
 *       await downloadFile(url, dest);
 *     }},
 *     minFiles: 50,
 *   }));
 *
 * With pre-steps:
 *
 *   defineRegion('de/example', metadata, [
 *     step('fetch-index', async (ctx) => { ... }),
 *     ...tileSteps({ init: async (ctx) => readUrls(ctx), ... }),
 *   ]);
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { shuffle } from './array.ts';
import { step, type Step, type StepContext } from './framework.ts';
import { pipeline, skip } from './pipeline.ts';
import { expectMinFiles } from './validators.ts';

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
}

const LABELS = ['converted', 'skipped', 'empty'] as const;

export interface ProcessTilesOptions<T extends TileItem, D = void> {
	/** Generate the items to process */
	init: (ctx: StepContext) => T[] | Promise<T[]>;
	/** Download stage */
	download: {
		concurrency: number;
		fn: (item: T, ctx: TileContext) => Promise<D | 'empty' | void>;
	};
	/** Convert stage (optional). When present, download.fn returns D, convert.fn receives it. */
	convert?: {
		concurrency: number;
		fn: (data: Exclude<D, 'empty' | void>, ctx: TileContext) => Promise<void>;
	};
	/** Minimum number of *.versatiles output files required */
	minFiles: number;
}

/**
 * Creates a download-tiles Step[] from a tiles config.
 * Use with defineRegion as the steps argument.
 */
export function tileSteps<T extends TileItem, D>(options: ProcessTilesOptions<T, D>): Step[] {
	return [
		step('download-tiles', async (ctx) => {
			const items = await options.init(ctx);
			await processTiles(items, ctx, options);
		}),
	];
}

type ConvertEnvelope<D> = { data: Exclude<D, 'empty' | void>; tileCtx: TileContext };

async function processTiles<T extends TileItem, D>(
	items: T[],
	ctx: StepContext,
	options: ProcessTilesOptions<T, D>,
): Promise<void> {
	const tilesDir = join(ctx.dataDir, 'tiles');
	mkdirSync(tilesDir, { recursive: true });

	const shuffled = shuffle([...items]);

	const makeTileCtx = (item: T): TileContext => ({
		dest: join(tilesDir, `${item.id}.versatiles`),
		skipDest: join(tilesDir, `${item.id}.skip`),
		tempDir: ctx.tempDir,
		tilesDir,
	});

	const isSkipped = (item: T): boolean => {
		const tileCtx = makeTileCtx(item);
		return existsSync(tileCtx.dest) || existsSync(tileCtx.skipDest);
	};

	if (options.convert) {
		const { download, convert } = options;
		await pipeline(shuffled, { progress: { labels: [...LABELS] } })
			.map(download.concurrency, async (item: T) => {
				if (isSkipped(item)) return skip('skipped');
				const tileCtx = makeTileCtx(item);
				const result = await download.fn(item, tileCtx);
				if (result === 'empty') return skip('empty');
				if (result == null) return null;
				return { data: result, tileCtx } as ConvertEnvelope<D>;
			})
			.forEach(convert.concurrency, async (envelope) => {
				const { data, tileCtx } = envelope as ConvertEnvelope<D>;
				await convert.fn(data, tileCtx);
				return 'converted';
			});
	} else {
		const { download } = options;
		await pipeline(shuffled, { progress: { labels: [...LABELS] } }).forEach(download.concurrency, async (item: T) => {
			if (isSkipped(item)) return 'skipped';
			const tileCtx = makeTileCtx(item);
			const result = await download.fn(item, tileCtx);
			if (result === 'empty') return 'empty';
			return 'converted';
		});
	}

	await expectMinFiles(tilesDir, '*.versatiles', options.minFiles);
}
