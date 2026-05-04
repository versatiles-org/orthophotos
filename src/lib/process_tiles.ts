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

import { createReadStream, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { shuffle } from './array.ts';
import type { RegionMetadata, RegionPipeline, StepContext } from './framework.ts';
import { safeRm } from './fs.ts';
import { type ConcurrencyLimit, pipeline, resolveConcurrency, skip } from './pipeline.ts';
import { ErrorBucket, expectMinFiles } from './validators.ts';

/** Items must have an `id` property used to derive output and skip-file paths. */
export interface TileItem {
	id: string;
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
	/**
	 * Register a path for automatic cleanup after this item finishes
	 * (success, error, or `'empty'`/`'invalid'` skip). Returns the path
	 * unchanged so it can be used inline.
	 */
	tempFile<P extends string>(path: P): P;
}

export interface TileRegionOptions<T extends TileItem, D> {
	/** Region identifier (e.g. 'de/thueringen') */
	name: string;
	/** Region metadata */
	meta: RegionMetadata;
	/** Generate the items to process */
	init: (ctx: StepContext) => T[] | Promise<T[]>;
	/** Download concurrency (default: 4) */
	/** Download concurrency limit. Default: 4. */
	downloadLimit?: ConcurrencyLimit;
	/** Download callback — returns data for the convert stage, 'empty'/'invalid' to skip, or void */
	download: (item: T, ctx: TileContext) => Promise<D | 'empty' | 'invalid' | void>;
	/** Limits for convert concurrency. Concurrency is the minimum of all applicable limits. */
	convertLimit?: ConcurrencyLimit;
	/** Convert callback — receives non-empty download result, produces the final .versatiles file */
	convert: (data: Exclude<D, 'empty' | 'invalid' | void>, ctx: TileContext) => Promise<void>;
	/** Minimum number of *.versatiles output files required */
	minFiles: number;
	/**
	 * Shuffle items before processing. Default: `true`. Set `false` when item
	 * ordering matters (e.g. rate-limited servers that prefer in-order requests,
	 * or when init's order already encodes a useful priority).
	 */
	shuffle?: boolean;
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

type ConvertEnvelope<D> = {
	data: Exclude<D, 'empty' | 'invalid' | void>;
	tileCtx: TileContext;
	runCleanup: () => void;
};

async function processTiles<T extends TileItem, D>(
	items: T[],
	ctx: StepContext,
	options: TileRegionOptions<T, D>,
): Promise<void> {
	const tilesDir = join(ctx.dataDir, 'tiles');
	mkdirSync(tilesDir, { recursive: true });

	const ordered = (options.shuffle ?? true) ? shuffle([...items]) : [...items];
	const errors = new ErrorBucket();

	const destFor = (item: T): string => join(tilesDir, `${item.id}.versatiles`);
	const skipDestFor = (item: T): string => join(tilesDir, `${item.id}.skip`);

	const isSkipped = (item: T): boolean => existsSync(destFor(item)) || existsSync(skipDestFor(item));

	const makeCtx = (item: T): { tileCtx: TileContext; runCleanup: () => void } => {
		const cleanupPaths: string[] = [];
		const tileCtx: TileContext = {
			dest: destFor(item),
			skipDest: skipDestFor(item),
			tempDir: ctx.tempDir,
			tilesDir,
			errors,
			tempFile<P extends string>(path: P): P {
				cleanupPaths.push(path);
				return path;
			},
		};
		const runCleanup = (): void => {
			while (cleanupPaths.length > 0) safeRm(cleanupPaths.pop()!);
		};
		return { tileCtx, runCleanup };
	};

	const dlConcurrency = resolveConcurrency(options.downloadLimit);
	const cvConcurrency = resolveConcurrency(options.convertLimit);

	const { download, convert } = options;
	await pipeline(ordered, { progress: { labels: [...LABELS], terminalProgress: true, title: options.name } })
		.map(dlConcurrency, async (item: T) => {
			if (isSkipped(item)) return skip('skipped');
			const { tileCtx, runCleanup } = makeCtx(item);
			try {
				const result = await download(item, tileCtx);
				if (result === 'empty') {
					runCleanup();
					return skip('empty');
				}
				if (result === 'invalid') {
					runCleanup();
					return skip('invalid');
				}
				if (result == null) {
					runCleanup();
					return null;
				}
				return { data: result, tileCtx, runCleanup } as ConvertEnvelope<D>;
			} catch (err) {
				runCleanup();
				throw err;
			}
		})
		.forEach(cvConcurrency, async (envelope) => {
			const { data, tileCtx, runCleanup } = envelope as ConvertEnvelope<D>;
			try {
				await convert(data, tileCtx);
				return 'converted';
			} finally {
				runCleanup();
			}
		});

	errors.throwIfAny();
	await expectMinFiles(tilesDir, '*.versatiles', options.minFiles);

	// Write filelist.txt with all .versatiles paths for the merge step
	const versatilesFiles: string[] = [];
	for (const entry of readdirSync(tilesDir)) {
		if (entry.endsWith('.versatiles')) {
			versatilesFiles.push(join(tilesDir, entry));
		}
	}
	const filelistPath = join(ctx.dataDir, 'filelist.txt');
	writeFileSync(filelistPath, versatilesFiles.join('\n'));
	console.log(`  Wrote filelist.txt with ${versatilesFiles.length} entries.`);
}

async function readNdjson<T>(path: string): Promise<T[]> {
	const items: T[] = [];
	const rl = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
	for await (const line of rl) {
		if (line.trim()) items.push(JSON.parse(line) as T);
	}
	return items;
}
