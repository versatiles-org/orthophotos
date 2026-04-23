/**
 * Shared helpers for French orthophoto sub-regions (BD ORTHO®).
 *
 * All French sub-régions pull from the same IGN Géoplateforme ATOM feed at
 * https://data.geopf.fr/telechargement/resource/BDORTHO, so the per-file
 * init/download/convert bodies are identical apart from the département list.
 * The logic lives here once instead of being duplicated across 18 files.
 */

import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { getConfig } from '../config.ts';
import { downloadFile, runCommand } from '../lib/command.ts';
import type { RegionMetadata, RegionPipeline } from '../lib/framework.ts';
import { safeRm } from '../lib/fs.ts';
import { pipeline } from '../lib/pipeline.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { runMosaicAssemble, runMosaicTile } from '../run/commands.ts';

export const FEED_BASE = 'https://data.geopf.fr/telechargement/resource/BDORTHO';

// Géoplateforme enforces ~1 req/s per client on this endpoint.
const REQUEST_INTERVAL_MS = 1200;

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** An entry parsed from the main BD ORTHO ATOM feed. */
export interface IndexEntry {
	title: string;
	zone: string; // e.g. 'D075', 'D02A', 'D971'
	version: string; // '1-0' or '2-0'
	bands: string; // e.g. 'RVB-0M20', 'IRC-0M15'
	resolution: string; // '0M15' | '0M20' | '0M50'
	editionDate: string; // 'YYYY-MM-DD'
	detailUrl: string; // ATOM feed URL for the per-resource detail
}

/** An item produced by init — one per selected département. */
export interface BdorthoItem {
	id: string; // e.g. 'D075_2024-01-01'
	zone: string;
	title: string;
	detailUrl: string;
	editionDate: string;
	[key: string]: unknown;
}

export interface FrSubRegionOptions {
	name: string;
	/** Exact IGN zone codes (e.g. ['D022', 'D029', 'D035', 'D056']). */
	departmentCodes: string[];
}

/** Shared metadata for all French sub-régions — license, creator, notes, mask. */
function buildMeta(): RegionMetadata {
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
		date: '2021-2025',
		releaseDate: '2026-04-23',
		mask: true,
	};
}

/**
 * Fetches every page of the BD ORTHO ATOM feed, caching each page in `cacheDir`.
 * Returns the list of cached page file paths, in order.
 */
export async function fetchIndexPages(cacheDir: string): Promise<string[]> {
	mkdirSync(cacheDir, { recursive: true });

	const firstPath = join(cacheDir, 'page_1.xml');
	if (!existsSync(firstPath)) {
		await withRetry(() => downloadFile(`${FEED_BASE}?page=1`, firstPath), { maxAttempts: 3 });
	}
	const firstXml = await readFile(firstPath, 'utf-8');
	const pageCountMatch = firstXml.match(/gpf_dl:pagecount="(\d+)"/);
	if (!pageCountMatch) throw new Error('Could not determine page count from BD ORTHO ATOM feed');
	const pageCount = parseInt(pageCountMatch[1], 10);

	const paths: string[] = [firstPath];
	for (let i = 2; i <= pageCount; i++) {
		const path = join(cacheDir, `page_${i}.xml`);
		if (!existsSync(path)) {
			await sleep(REQUEST_INTERVAL_MS);
			await withRetry(() => downloadFile(`${FEED_BASE}?page=${i}`, path), { maxAttempts: 3 });
		}
		paths.push(path);
	}
	return paths;
}

/**
 * Parses one ATOM feed page into structured index entries.
 * Returns only RVB (visible-light) entries; IRC/GRAPHE-MOSAIQUAGE are filtered out.
 */
export function parseIndexPage(xml: string): IndexEntry[] {
	const parsed = xmlParser.parse(xml) as Record<string, unknown>;
	const feed = parsed.feed as Record<string, unknown> | undefined;
	const rawEntries: unknown[] = [feed?.entry ?? []].flat();

	const out: IndexEntry[] = [];
	for (const raw of rawEntries) {
		const entry = raw as Record<string, unknown>;
		const title = typeof entry.title === 'string' ? entry.title : undefined;
		if (!title) continue;

		const parts = title.split('_');
		// Expected: BDORTHO_<version>_<bands>_<format>_<projection>_<zone>_<date>
		if (parts.length !== 7 || parts[0] !== 'BDORTHO') continue;
		const [, version, bands] = parts;
		const bandParts = bands.split('-');
		if (bandParts[0] !== 'RVB') continue; // skip IRC, GRAPHE-MOSAIQUAGE, etc.
		const resolution = bandParts[1];

		const zoneElt = entry['gpf_dl:zone'] as { '@_term'?: string } | undefined;
		const zone = zoneElt?.['@_term'];
		if (!zone) continue;

		const editionDate = entry['gpf_dl:editionDate'];
		if (typeof editionDate !== 'string') continue;

		// <link rel="alternate" type="application/atom+xml" href="…"/> is the detail feed URL.
		const links: unknown[] = [entry.link ?? []].flat();
		let detailUrl: string | undefined;
		for (const l of links) {
			const link = l as { '@_href'?: string; '@_type'?: string; '@_rel'?: string };
			if (link['@_type'] === 'application/atom+xml' && link['@_rel'] === 'alternate') {
				detailUrl = link['@_href'];
				break;
			}
		}
		if (!detailUrl) continue;

		out.push({ title, zone, version, bands, resolution, editionDate, detailUrl });
	}
	return out;
}

/**
 * Picks the best available entry per zone.
 * Order: newer version (2-0 > 1-0), then highest resolution (0M15 > 0M20 > 0M50), then latest editionDate.
 */
export function pickBestPerZone(entries: IndexEntry[]): Map<string, IndexEntry> {
	const best = new Map<string, IndexEntry>();
	const versionRank = (v: string): number => (v === '2-0' ? 2 : 1);
	const resolutionRank = (r: string): number => (r === '0M15' ? 3 : r === '0M20' ? 2 : 1);

	const score = (e: IndexEntry): [number, number, string] => [
		versionRank(e.version),
		resolutionRank(e.resolution),
		e.editionDate,
	];
	const better = (a: IndexEntry, b: IndexEntry): boolean => {
		const [av, ar, ad] = score(a);
		const [bv, br, bd] = score(b);
		if (av !== bv) return av > bv;
		if (ar !== br) return ar > br;
		return ad > bd;
	};

	for (const e of entries) {
		const current = best.get(e.zone);
		if (!current || better(e, current)) best.set(e.zone, e);
	}
	return best;
}

/** Extracts 7z download URLs from a per-resource detail ATOM feed. */
export function parseDetailFeed(xml: string): string[] {
	const parsed = xmlParser.parse(xml) as Record<string, unknown>;
	const feed = parsed.feed as Record<string, unknown> | undefined;
	const rawEntries: unknown[] = [feed?.entry ?? []].flat();

	const urls: string[] = [];
	for (const raw of rawEntries) {
		const entry = raw as Record<string, unknown>;
		const links: unknown[] = [entry.link ?? []].flat();
		for (const l of links) {
			const link = l as { '@_href'?: string };
			const href = link['@_href'];
			if (!href) continue;
			if (href.endsWith('.7z') || /\.7z\.\d+$/.test(href)) urls.push(href);
		}
	}
	return urls.sort();
}

/**
 * Defines a French sub-région pipeline. Each sub-région passes its list of
 * IGN département zone codes; shared logic handles the ATOM-feed scraping,
 * 7z download + extraction, and JP2 → .versatiles conversion + assembly.
 */
export function defineFrSubRegion(opts: FrSubRegionOptions): RegionPipeline {
	return defineTileRegion<BdorthoItem, { extractDir: string }>({
		name: opts.name,
		meta: buildMeta(),
		init: async () => {
			// Cache the ATOM feed once, under the global temp dir, so all fr/* sub-regions
			// share the same 141 page downloads instead of re-fetching them per region.
			const cacheDir = join(getConfig().dirTemp, 'fr_shared', 'index');
			console.log('  Fetching BD ORTHO ATOM feed...');
			const pagePaths = await fetchIndexPages(cacheDir);

			const allEntries: IndexEntry[] = [];
			for (const p of pagePaths) {
				allEntries.push(...parseIndexPage(await readFile(p, 'utf-8')));
			}
			const bestPerZone = pickBestPerZone(allEntries);

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
			if (existsSync(extractDir)) return { extractDir };

			const detailPath = join(tempDir, `${item.id}_detail.xml`);
			await sleep(REQUEST_INTERVAL_MS);
			await withRetry(() => downloadFile(item.detailUrl, detailPath), { maxAttempts: 3 });
			const urls = parseDetailFeed(await readFile(detailPath, 'utf-8'));
			rmSync(detailPath, { force: true });
			if (urls.length === 0) throw new Error(`No .7z archive listed for ${item.id}`);

			const tmpExtractDir = `${extractDir}.tmp`;
			safeRm(tmpExtractDir);

			console.log(`  Downloading ${item.id} (${urls.length} part${urls.length === 1 ? '' : 's'})...`);
			for (const url of urls) {
				const filename = url.split('/').pop()!;
				const filePath = join(tempDir, filename);
				if (!existsSync(filePath)) {
					await withRetry(() => downloadFile(url, filePath, { minSize: 1024, continue: true }), {
						maxAttempts: 3,
					});
				}
			}

			// Pick the entry point: the single .7z or the .7z.001 part.
			const mainName = urls
				.find((u) => u.endsWith('.7z') || u.endsWith('.7z.001'))!
				.split('/')
				.pop()!;
			const mainPath = join(tempDir, mainName);

			console.log(`  Extracting ${item.id}...`);
			await runCommand('7z', ['e', `-o${tmpExtractDir}`, '-bb0', '-aoa', mainPath]);
			renameSync(tmpExtractDir, extractDir);

			for (const url of urls) {
				safeRm(join(tempDir, url.split('/').pop()!));
			}

			return { extractDir };
		},
		convertLimit: { concurrency: 1 },
		convert: async ({ extractDir }, { dest, tempDir }) => {
			const tilesDir = join(tempDir, `tiles_${Date.now()}`);
			try {
				const files = await readdir(extractDir);
				const jp2Files = files.filter((f) => f.endsWith('.jp2')).map((f) => join(extractDir, f));
				if (jp2Files.length === 0) throw new Error(`No JP2 files found in ${extractDir}`);

				mkdirSync(tilesDir, { recursive: true });
				console.log(`  Converting ${jp2Files.length} JP2 files...`);
				const versatilesFiles: string[] = [];
				await pipeline(jp2Files, { progress: { labels: ['converted'] } }).forEach(4, async (jp2Path) => {
					const tileName = basename(jp2Path, '.jp2') + '.versatiles';
					const tilePath = join(tilesDir, tileName);
					await runMosaicTile(jp2Path, tilePath);
					versatilesFiles.push(tilePath);
					return 'converted';
				});

				const filelistPath = join(tempDir, `filelist_${Date.now()}.txt`);
				writeFileSync(filelistPath, versatilesFiles.join('\n'));
				await runMosaicAssemble(filelistPath, dest, { lossless: true, quiet: true });
				rmSync(filelistPath, { force: true });
			} finally {
				safeRm(extractDir);
				safeRm(tilesDir);
			}
		},
		minFiles: opts.departmentCodes.length,
	});
}
