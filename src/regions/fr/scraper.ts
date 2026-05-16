/**
 * Side-effecting French BD ORTHO® scraper: fetches the JSON feed (the
 * Géoplateforme endpoint serves both ATOM XML and JSON via content
 * negotiation; we use `Accept: application/json`), picks the best resource
 * per département, downloads + extracts the 7z archives, and tiles the JP2
 * images into a `.versatiles` container per sub-région.
 *
 * Pure parsers live in `parsers.ts`. The data table lives in `regions.ts`.
 * The assembly point that wires both together is `index.ts`.
 */

import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
	convertToTiledTiff,
	createProgress,
	defineTileRegion,
	downloadFile,
	downloadFiles,
	fetchWithInterval,
	getConfig,
	pipeline,
	type RegionMetadata,
	type RegionPipeline,
	runCommand,
	runMosaicAssemble,
	runMosaicTile,
	safeRm,
	sleep,
	withRetry,
} from '../../lib/index.ts';
import {
	type BdorthoDetailPart,
	computeDateRange,
	type IndexEntry,
	parseDetailFeed,
	parseIndexPage,
	pickBestPerZone,
} from './parsers.ts';

// ---------------------------------------------------------------------------
// Constants + types
// ---------------------------------------------------------------------------

const FEED_BASE = 'https://data.geopf.fr/telechargement/resource/BDORTHO';

// Géoplateforme enforces ~1 req/s per client on this endpoint.
const REQUEST_INTERVAL_MS = 1200;

// Date range covered by the BD ORTHO feed, derived from editionDate years of all
// zones. Verified at init time against the feed and surfaced via buildMeta(). If
// the check fails with a new range, update this constant.
const FR_DATE_RANGE = '2004-2025';

/** An item produced by init — one per selected département. */
interface BdorthoItem {
	id: string; // e.g. 'D075_2024-01-01'
	zone: string;
	title: string;
	detailUrl: string;
	editionDate: string;
}

export interface FrSubRegionOptions {
	name: string;
	/** Exact IGN zone codes (e.g. ['D022', 'D029', 'D035', 'D056']). */
	departmentCodes: string[];
	/**
	 * Per-region release date (YYYY-MM-DD), tracked individually because each
	 * `fr/*` sub-région finishes uploading on its own day. The aggregated `fr`
	 * entry on the status page takes the latest of these.
	 */
	releaseDate: string;
}

/** Shared metadata for all French sub-régions — license, creator, notes, mask. */
function buildMeta(opts: FrSubRegionOptions): RegionMetadata {
	return {
		status: 'released',
		notes: [
			'Data source: IGN Géoplateforme BD ORTHO® ATOM feed (https://data.geopf.fr/telechargement/resource/BDORTHO).',
			'The feed is paginated (~141 pages) and rate-limited to roughly one request per second.',
			'Images are packed into 7z archives containing JPEG2000 tiles.',
			'National license (Licence Ouverte 2.0) — attribution required.',
		],
		entries: ['result'],
		license: {
			name: 'LO 2.0',
			url: 'https://www.data.gouv.fr/datasets/licence-ouverte-2-0',
			requiresAttribution: true,
		},
		creator: {
			name: "Institut national de l'information géographique et forestière (IGN-F)",
			url: 'https://geoservices.ign.fr/documentation/donnees/ortho/bdortho',
		},
		date: FR_DATE_RANGE,
		releaseDate: opts.releaseDate,
		mask: true,
		aggregateUnder: 'fr',
	};
}

// ---------------------------------------------------------------------------
// Index-feed phase (used by `init`)
// ---------------------------------------------------------------------------

const JSON_HEADERS = { Accept: 'application/json' };

// 50 is the server-enforced maximum: anything higher silently clamps back to 50.
// At 1 req/s this drops the index walk from ~140 pages to ~30 (~4.7× fewer requests).
const INDEX_PAGE_SIZE = 50;

/**
 * Fetches every page of the BD ORTHO index, caching each page (as JSON) in `cacheDir`.
 * Returns the list of cached page file paths, in order. Total page count is read from
 * the first page's `pagecount` field. The page size is encoded in the cache filename
 * so cached pages from a different size aren't reused.
 */
export async function fetchIndexPages(cacheDir: string): Promise<string[]> {
	mkdirSync(cacheDir, { recursive: true });

	const pageUrl = (n: number): string => `${FEED_BASE}?page=${n}&limit=${INDEX_PAGE_SIZE}`;
	const pagePath = (n: number): string => join(cacheDir, `page-${INDEX_PAGE_SIZE}-${n}.json`);

	// Fetch page 1 up front so we can learn the total page count for the progress bar.
	const firstPath = pagePath(1);
	const firstWasCached = existsSync(firstPath);
	if (!firstWasCached) {
		await withRetry(() => downloadFile(pageUrl(1), firstPath, { headers: JSON_HEADERS }), {
			maxAttempts: 3,
		});
	}
	const firstBody = JSON.parse(await readFile(firstPath, 'utf-8')) as { pagecount?: number };
	const pageCount = firstBody.pagecount;
	if (typeof pageCount !== 'number') throw new Error('Could not determine page count from BD ORTHO index');

	const progress = createProgress(pageCount, { labels: ['fetched', 'cached'], logInterval: 10 });
	progress.tick(firstWasCached ? 'cached' : 'fetched');

	const items: { path: string; url: string }[] = [];
	for (let i = 2; i <= pageCount; i++) {
		items.push({ path: pagePath(i), url: pageUrl(i) });
	}

	await fetchWithInterval(items, ({ url, path }) => downloadFile(url, path, { headers: JSON_HEADERS }), {
		intervalMs: REQUEST_INTERVAL_MS,
		retry: { maxAttempts: 3 },
		shouldFetch: ({ path }) => !existsSync(path),
		onSkip: () => progress.tick('cached'),
		onFetch: () => progress.tick('fetched'),
	});

	progress.done();
	return [firstPath, ...items.map((it) => it.path)];
}

// ---------------------------------------------------------------------------
// Per-item phase (used by `download` / `convert`)
// ---------------------------------------------------------------------------

/**
 * Removes this item's transient scratch files from `tempDir`: the detail-feed
 * JSON and every `.7z` / `.7z.NNN` archive part (including any curl `.tmp`
 * partial). Matching is scoped by `item.title` so concurrent items don't
 * clobber each other. Safe to call whether or not the files actually exist.
 */
function cleanItemArtifacts(tempDir: string, item: { id: string; title: string }): void {
	safeRm(join(tempDir, `${item.id}_detail.json`));
	let entries: string[];
	try {
		entries = readdirSync(tempDir);
	} catch {
		return;
	}
	for (const name of entries) {
		if (!name.startsWith(item.title)) continue;
		// Matches: foo.7z, foo.7z.001, foo.7z.tmp, foo.7z.001.tmp
		if (/\.7z(?:\.\d+)?(?:\.tmp)?$/.test(name)) {
			safeRm(join(tempDir, name));
		}
	}
}

/** Returns the detail-feed URL with a generous `?limit=` so all parts come back in one page. */
function detailUrlWithLimit(detailUrl: string): string {
	const u = new URL(detailUrl);
	u.searchParams.set('limit', '1000');
	return u.toString();
}

// ---------------------------------------------------------------------------
// Region factory
// ---------------------------------------------------------------------------

/**
 * Defines a French sub-région pipeline. Each sub-région passes its list of
 * IGN département zone codes; shared logic handles the ATOM-feed scraping,
 * 7z download + extraction, and JP2 → .versatiles conversion + assembly.
 */
export function defineFrSubRegion(opts: FrSubRegionOptions): RegionPipeline {
	return defineTileRegion<BdorthoItem, { extractDir: string }>({
		name: opts.name,
		meta: buildMeta(opts),
		// Géoplateforme rate-limits per-client; processing items in feed order keeps
		// the per-département request bursts contiguous and avoids interleaving downloads
		// across départements (which the upstream is happier to serve sequentially).
		shuffle: false,
		init: async () => {
			// Cache the index feed once, under the global temp dir, so all fr/* sub-regions
			// share the same page downloads instead of re-fetching them per region.
			const cacheDir = join(getConfig().dirTemp, 'fr', 'index');
			console.log('  Fetching BD ORTHO index...');
			const pagePaths = await fetchIndexPages(cacheDir);

			const allEntries: IndexEntry[] = [];
			for (const p of pagePaths) {
				allEntries.push(...parseIndexPage(JSON.parse(await readFile(p, 'utf-8'))));
			}
			const bestPerZone = pickBestPerZone(allEntries);

			const observedRange = computeDateRange(Array.from(bestPerZone.values()).map((e) => e.editionDate));
			if (observedRange !== FR_DATE_RANGE) {
				throw new Error(
					`BD ORTHO feed now covers ${observedRange}, but FR_DATE_RANGE is set to '${FR_DATE_RANGE}'. ` +
						`Please update FR_DATE_RANGE in src/regions/fr/scraper.ts.`,
				);
			}

			const items: BdorthoItem[] = [];
			const missing: string[] = [];
			for (const code of opts.departmentCodes) {
				const best = bestPerZone.get(code);
				if (!best) {
					missing.push(code);
					continue;
				}
				items.push({
					id: `${best.zone}_${best.editionDate}`,
					zone: best.zone,
					title: best.title,
					detailUrl: best.detailUrl,
					editionDate: best.editionDate,
				});
			}
			if (missing.length > 0) {
				throw new Error(`Département codes not found in BD ORTHO feed: ${missing.join(', ')}`);
			}
			console.log(`  Selected ${items.length} département resources for ${opts.name}`);
			return items;
		},
		downloadLimit: 1,
		download: async (item, { tempDir }) => {
			const extractDir = join(tempDir, item.id);
			if (existsSync(extractDir)) {
				// Extraction already done in a previous run. Sweep any archive parts
				// that survived an interrupted cleanup so they don't linger forever.
				cleanItemArtifacts(tempDir, item);
				return { extractDir };
			}

			const detailPath = join(tempDir, `${item.id}_detail.json`);
			await sleep(REQUEST_INTERVAL_MS);
			await withRetry(() => downloadFile(detailUrlWithLimit(item.detailUrl), detailPath, { headers: JSON_HEADERS }), {
				maxAttempts: 3,
			});
			let parts: BdorthoDetailPart[];
			try {
				parts = parseDetailFeed(JSON.parse(await readFile(detailPath, 'utf-8')));
			} finally {
				rmSync(detailPath, { force: true });
			}
			if (parts.length === 0) throw new Error(`No .7z archive listed for ${item.id}`);

			const tmpExtractDir = `${extractDir}.tmp`;
			safeRm(tmpExtractDir);

			await downloadFiles(
				// `size` from the feed lets `downloadFiles({progress: 'size'})` skip its HEAD probes.
				parts.map(({ url, length }) => ({ url, dest: join(tempDir, url.split('/').pop()!), size: length })),
				{
					progress: 'size',
					title: `Downloading ${item.id} (${parts.length} part${parts.length === 1 ? '' : 's'})`,
					// BD ORTHO 7z parts are multi-GB and Géoplateforme drops the
					// connection partway through often enough that retry-from-zero
					// can't catch up. `continue: true` makes each retry resume from
					// the `.tmp` partial via a `Range:` request, so attempts chain
					// forward progress instead of repeatedly restarting at 0%.
					download: { continue: true },
					// Géoplateforme rate-limits to ~1 req/s and serves 429s otherwise.
					// Throttle proactively, and back off generously on 429/5xx. With
					// resume enabled we can afford many more attempts because each
					// one makes forward progress.
					intervalMs: REQUEST_INTERVAL_MS,
					retry: { maxAttempts: 50, initialDelayMs: 5000, maxDelayMs: 60000, backoffMultiplier: 2 },
				},
			);

			// Pick the entry point: the single .7z or the .7z.001 part.
			const mainName = parts
				.find(({ url }) => url.endsWith('.7z') || url.endsWith('.7z.001'))!
				.url.split('/')
				.pop()!;
			const mainPath = join(tempDir, mainName);

			console.log(`  Extracting ${item.id}...`);
			await runCommand('7z', ['e', `-o${tmpExtractDir}`, '-bb0', '-bso0', '-bsp0', '-aoa', mainPath], {
				quiet: true,
			});
			renameSync(tmpExtractDir, extractDir);

			cleanItemArtifacts(tempDir, item);

			return { extractDir };
		},
		convertLimit: { concurrency: 1 },
		convert: async ({ extractDir }, { dest, tempDir }) => {
			const tilesDir = join(tempDir, `tiles`);
			try {
				const files = await readdir(extractDir);
				const jp2Files = files.filter((f) => f.endsWith('.jp2')).map((f) => join(extractDir, f));
				if (jp2Files.length === 0) throw new Error(`No JP2 files found in ${extractDir}`);

				mkdirSync(tilesDir, { recursive: true });
				console.log(`  Converting ${jp2Files.length} JP2 files...`);
				const versatilesFiles: string[] = [];
				// Two-stage pipeline: up to 4 concurrent JP2 → TIFF decodes (GDAL-bound,
				// parallelizes well) feed a single-slot TIFF → .versatiles tile step
				// (versatiles mosaic tile already uses all cores internally).
				await pipeline(jp2Files, { progress: { labels: ['converted'] } })
					.map({ memoryGB: 5 }, async (jp2Path) => {
						const baseName = basename(jp2Path, '.jp2');
						const tifPath = join(tilesDir, `${baseName}.tif`);
						try {
							// Decompress JP2 → tiled LZW GeoTIFF first. GDAL's JP2 decoder is
							// more robust than versatiles's; tiled + light compression keeps the
							// intermediate both fast to write and efficient to random-access.
							await convertToTiledTiff(jp2Path, tifPath, { compress: 'lzw', predictor: false, alpha: true });
						} finally {
							safeRm(jp2Path);
						}
						return { tifPath, tilePath: join(tilesDir, `${baseName}.versatiles`) };
					})
					.forEach({ memoryGB: 20 }, async ({ tifPath, tilePath }) => {
						try {
							await runMosaicTile(tifPath, tilePath);
							versatilesFiles.push(tilePath);
							return 'converted';
						} finally {
							safeRm(tifPath);
						}
					});

				const filelistPath = join(tempDir, `filelist_${Date.now()}.txt`);
				writeFileSync(filelistPath, versatilesFiles.join('\n'));
				await runMosaicAssemble(filelistPath, dest, { lossless: true, quiet: true });
				rmSync(filelistPath, { force: true });
			} finally {
				// Always drop the per-run tilesDir (partial .versatiles are never reused).
				safeRm(tilesDir);
			}
			// Outside the finally on purpose: keep the extracted JP2 directory if convert
			// failed, so the next run skips the expensive 7z re-extraction.
			safeRm(extractDir);
		},
		minFiles: opts.departmentCodes.length,
	});
}
