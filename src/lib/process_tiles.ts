/**
 * High-level tile processing helper built on top of `pipeline`.
 *
 * Handles the boilerplate that every region repeats:
 * tilesDir setup, shuffle, skip checks, progress, and expectMinFiles.
 *
 * Single-stage (download only):
 *   await processTiles(urls, ctx, {
 *     dest: (url) => basename(url),
 *     download: { concurrency: 8, fn: async (url, dest) => {
 *       await downloadFile(url, dest);
 *       return 'downloaded';
 *     }},
 *     labels: ['downloaded', 'skipped'],
 *     minFiles: { pattern: '*.jp2', count: 50 },
 *   });
 *
 * Two-stage (download + convert):
 *   await processTiles(coords, ctx, {
 *     dest: ({ id }) => `${id}.versatiles`,
 *     skipFile: ({ id }) => `${id}.skip`,
 *     download: { concurrency: 4, fn: async ({ id }) => {
 *       const tif = await downloadTif(id);
 *       return { tif };
 *     }},
 *     convert: { concurrency: 2, fn: async ({ tif }, dest) => {
 *       await convert(tif, dest);
 *       return 'converted';
 *     }},
 *     labels: ['converted', 'skipped', 'empty'],
 *     minFiles: { pattern: '*.versatiles', count: 50 },
 *   });
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { shuffle } from './array.ts';
import type { StepContext } from './framework.ts';
import { pipeline, Skip, skip } from './pipeline.ts';
import { expectMinFiles } from './validators.ts';

export interface ProcessTilesOptions<T, D = string | void> {
	/** Output filename relative to tilesDir */
	dest: (item: T) => string;
	/** Skip-file name relative to tilesDir (for probe-based regions) */
	skipFile?: (item: T) => string;
	/** Download stage */
	download: {
		concurrency: number;
		fn: (item: T, dest: string) => Promise<D | Skip | null | undefined | void>;
	};
	/** Convert stage (optional). When present, download.fn returns D, convert.fn receives it. */
	convert?: {
		concurrency: number;
		fn: (data: Exclude<D, Skip | null | undefined | void>, dest: string) => Promise<string | void>;
	};
	/** Progress bar labels */
	labels: string[];
	/** Minimum output files validation */
	minFiles: { pattern: string; count: number };
}

export async function processTiles<T, D>(
	items: T[],
	ctx: StepContext,
	options: ProcessTilesOptions<T, D>,
): Promise<void> {
	const tilesDir = join(ctx.dataDir, 'tiles');
	mkdirSync(tilesDir, { recursive: true });

	const shuffled = shuffle([...items]);

	const resolveDest = (item: T): string => join(tilesDir, options.dest(item));

	const isSkipped = (item: T): boolean => {
		if (existsSync(resolveDest(item))) return true;
		if (options.skipFile && existsSync(join(tilesDir, options.skipFile(item)))) return true;
		return false;
	};

	type Envelope = { data: Exclude<D, Skip | null | undefined | void>; dest: string };

	if (options.convert) {
		const { download, convert } = options;
		await pipeline(shuffled, { progress: { labels: options.labels } })
			.map(download.concurrency, async (item: T) => {
				if (isSkipped(item)) return skip('skipped');
				const dest = resolveDest(item);
				const result = await download.fn(item, dest);
				if (result instanceof Skip || result == null) return result as Skip | null;
				return { data: result, dest } as Envelope;
			})
			.forEach(convert.concurrency, async (envelope) => {
				const { data, dest } = envelope as Envelope;
				return await convert.fn(data, dest);
			});
	} else {
		const { download } = options;
		await pipeline(shuffled, { progress: { labels: options.labels } })
			.map(download.concurrency, async (item: T) => {
				if (isSkipped(item)) return skip('skipped');
				const dest = resolveDest(item);
				const result = await download.fn(item, dest);
				if (result instanceof Skip) return result;
				if (typeof result === 'string') return result;
				return null;
			})
			.run();
	}

	await expectMinFiles(tilesDir, options.minFiles.pattern, options.minFiles.count);
}
