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
 *     dest: ({ id }) => `${id}.versatiles`,
 *     download: { concurrency: 4, fn: async ({ id }, { dest, tempDir }) => {
 *       await downloadFile(url, dest);
 *       return skip('downloaded');
 *     }},
 *     labels: ['downloaded', 'skipped'],
 *     minFiles: { pattern: '*.versatiles', count: 50 },
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
import { step, type StepContext } from './framework.ts';
import { pipeline, Skip, skip } from './pipeline.ts';
import { expectMinFiles } from './validators.ts';

/** Context passed to download/convert callbacks */
export interface TileContext {
	/** Full path to the output file */
	dest: string;
	/** Directory for temporary files */
	tempDir: string;
	/** Directory where output tiles live */
	tilesDir: string;
}

export interface ProcessTilesOptions<T, D = string | void> {
	/** Generate the items to process */
	init: (ctx: StepContext) => T[] | Promise<T[]>;
	/** Output filename relative to tilesDir */
	dest: (item: T) => string;
	/** Skip-file name relative to tilesDir (for probe-based regions) */
	skipFile?: (item: T) => string;
	/** Download stage */
	download: {
		concurrency: number;
		fn: (item: T, ctx: TileContext) => Promise<D | Skip | null | undefined | void>;
	};
	/** Convert stage (optional). When present, download.fn returns D, convert.fn receives it. */
	convert?: {
		concurrency: number;
		fn: (data: Exclude<D, Skip | null | undefined | void>, ctx: TileContext) => Promise<string | void>;
	};
	/** Progress bar labels */
	labels: string[];
	/** Minimum output files validation */
	minFiles: { pattern: string; count: number };
}

/**
 * Creates a download-tiles Step[] from a tiles config.
 * Use with defineRegion as the steps argument.
 */
export function tileSteps<T, D>(options: ProcessTilesOptions<T, D>): ReturnType<typeof step>[] {
	return [
		step('download-tiles', async (ctx) => {
			const items = await options.init(ctx);
			await processTiles(items, ctx, options);
		}),
	];
}

async function processTiles<T, D>(items: T[], ctx: StepContext, options: ProcessTilesOptions<T, D>): Promise<void> {
	const tilesDir = join(ctx.dataDir, 'tiles');
	mkdirSync(tilesDir, { recursive: true });

	const shuffled = shuffle([...items]);

	const resolveDest = (item: T): string => join(tilesDir, options.dest(item));

	const isSkipped = (item: T): boolean => {
		if (existsSync(resolveDest(item))) return true;
		if (options.skipFile && existsSync(join(tilesDir, options.skipFile(item)))) return true;
		return false;
	};

	const makeTileCtx = (item: T): TileContext => ({
		dest: resolveDest(item),
		tempDir: ctx.tempDir,
		tilesDir,
	});

	type Envelope = { data: Exclude<D, Skip | null | undefined | void>; tileCtx: TileContext };

	if (options.convert) {
		const { download, convert } = options;
		await pipeline(shuffled, { progress: { labels: options.labels } })
			.map(download.concurrency, async (item: T) => {
				if (isSkipped(item)) return skip('skipped');
				const tileCtx = makeTileCtx(item);
				const result = await download.fn(item, tileCtx);
				if (result instanceof Skip || result == null) return result as Skip | null;
				return { data: result, tileCtx } as Envelope;
			})
			.forEach(convert.concurrency, async (envelope) => {
				const { data, tileCtx } = envelope as Envelope;
				return await convert.fn(data, tileCtx);
			});
	} else {
		const { download } = options;
		await pipeline(shuffled, { progress: { labels: options.labels } })
			.map(download.concurrency, async (item: T) => {
				if (isSkipped(item)) return skip('skipped');
				const tileCtx = makeTileCtx(item);
				const result = await download.fn(item, tileCtx);
				if (result instanceof Skip) return result;
				if (typeof result === 'string') return result;
				return null;
			})
			.run();
	}

	await expectMinFiles(tilesDir, options.minFiles.pattern, options.minFiles.count);
}
