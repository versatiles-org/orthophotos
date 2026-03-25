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

import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { availableParallelism, totalmem } from 'node:os';
import { join } from 'node:path';
import { shuffle } from './array.ts';
import type { RegionMetadata, RegionPipeline, StepContext } from './framework.ts';
import { pipeline, skip } from './pipeline.ts';
import { ErrorBucket, expectMinFiles } from './validators.ts';

/** Limits for concurrency. The effective concurrency is the minimum of all applicable limits. */
export interface ConcurrencyLimit {
	/** CPU cores per process (default: 4). Concurrency = availableParallelism() / cores. */
	cores?: number;
	/** Hard maximum concurrency. */
	concurrency?: number;
	/** GB of RAM per process. Concurrency = totalMemoryGB / memoryGB. */
	memoryGB?: number;
}

function resolveConcurrency(limit?: ConcurrencyLimit): number {
	const cpuLimit = Math.floor(availableParallelism() / (limit?.cores ?? 4));
	const memLimit = limit?.memoryGB ? Math.floor(totalmem() / 1e9 / limit.memoryGB) : Infinity;
	const hardLimit = limit?.concurrency ?? Infinity;
	return Math.max(1, Math.min(cpuLimit, memLimit, hardLimit));
}

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
	errors: ErrorBucket;
}

export interface TileRegionOptions<T extends TileItem, D> {
	/** Region identifier (e.g. 'de/thueringen') */
	name: string;
	/** Region metadata */
	meta: RegionMetadata;
	/** Generate the items to process */
	init: (ctx: StepContext) => T[] | Promise<T[]>;
	/** Download concurrency (default: 4) */
	downloadConcurrency?: number;
	/** Download callback — returns data for the convert stage, 'empty'/'invalid' to skip, or void */
	download: (item: T, ctx: TileContext) => Promise<D | 'empty' | 'invalid' | void>;
	/** Limits for convert concurrency. Concurrency is the minimum of all applicable limits. */
	convertLimit?: ConcurrencyLimit;
	/** Convert callback — receives non-empty download result, produces the final .versatiles file */
	convert: (data: Exclude<D, 'empty' | 'invalid' | void>, ctx: TileContext) => Promise<void>;
	/** Minimum number of *.versatiles output files required */
	minFiles: number;
}

/**
 * Define a tile-based region with a flat config.
 * Returns a RegionPipeline ready for export.
 */
export function defineTileRegion<T extends TileItem, D>(options: TileRegionOptions<T, D>): RegionPipeline {
	return {
		id: options.name,
		metadata: options.meta,
		run: async (ctx) => {
			const itemsPath = join(ctx.dataDir, 'items.ndjson');
			let items: T[];
			if (existsSync(itemsPath)) {
				console.log('  Loading cached item list...');
				items = await readNdjson<T>(itemsPath);
			} else {
				items = await options.init(ctx);
				mkdirSync(ctx.dataDir, { recursive: true });
				writeFileSync(itemsPath, items.map((item) => JSON.stringify(item)).join('\n') + '\n');
				console.log(`  Saved ${items.length} items to items.ndjson`);
			}
			if (items.length < options.minFiles) {
				throw new Error(`Init returned ${items.length} items, but minFiles requires at least ${options.minFiles}`);
			}
			await processTiles(items, ctx, options);
		},
	};
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
	const errors = new ErrorBucket();

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

	const dlConcurrency = options.downloadConcurrency ?? 4;
	const cvConcurrency = resolveConcurrency(options.convertLimit);

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

	errors.throwIfAny();
	await expectMinFiles(tilesDir, '*.versatiles', options.minFiles);
}

async function readNdjson<T>(path: string): Promise<T[]> {
	const items: T[] = [];
	const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
	for await (const line of rl) {
		if (line.trim()) items.push(JSON.parse(line) as T);
	}
	return items;
}
