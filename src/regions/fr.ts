/**
 * French orthophoto sub-régions (NUTS-1).
 *
 * All 18 régions pull from the same IGN Géoplateforme BD ORTHO® ATOM feed
 * (https://data.geopf.fr/telechargement/resource/BDORTHO) and differ only in
 * which départements they cover — so the data table (`FR_REGIONS`) and the
 * shared pipeline logic (`defineFrSubRegion` and its helpers) both live here.
 */

import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { getConfig } from '../config.ts';
import { downloadFile, downloadFiles, runCommand } from '../lib/command.ts';
import type { RegionMetadata, RegionPipeline } from '../lib/framework.ts';
import { safeRm } from '../lib/fs.ts';
import { pipeline } from '../lib/pipeline.ts';
import { createProgress } from '../lib/progress.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { convertToTiledTiff, runMosaicAssemble, runMosaicTile } from '../run/commands.ts';

// ---------------------------------------------------------------------------
// Shared pipeline helpers
// ---------------------------------------------------------------------------

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
interface BdorthoItem {
	id: string; // e.g. 'D075_2024-01-01'
	zone: string;
	title: string;
	detailUrl: string;
	editionDate: string;
	[key: string]: unknown;
}

interface FrSubRegionOptions {
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

	// Fetch page 1 up front so we can learn the total page count for the progress bar.
	const firstPath = join(cacheDir, 'page_1.xml');
	const firstWasCached = existsSync(firstPath);
	if (!firstWasCached) {
		await withRetry(() => downloadFile(`${FEED_BASE}?page=1`, firstPath), { maxAttempts: 3 });
	}
	const firstXml = await readFile(firstPath, 'utf-8');
	const pageCountMatch = firstXml.match(/gpf_dl:pagecount="(\d+)"/);
	if (!pageCountMatch) throw new Error('Could not determine page count from BD ORTHO ATOM feed');
	const pageCount = parseInt(pageCountMatch[1], 10);

	const progress = createProgress(pageCount, { labels: ['fetched', 'cached'], logInterval: 10 });
	progress.tick(firstWasCached ? 'cached' : 'fetched');

	const paths: string[] = [firstPath];
	for (let i = 2; i <= pageCount; i++) {
		const path = join(cacheDir, `page_${i}.xml`);
		if (existsSync(path)) {
			progress.tick('cached');
		} else {
			await sleep(REQUEST_INTERVAL_MS);
			await withRetry(() => downloadFile(`${FEED_BASE}?page=${i}`, path), { maxAttempts: 3 });
			progress.tick('fetched');
		}
		paths.push(path);
	}
	progress.done();
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

/**
 * Removes this item's transient scratch files from `tempDir`: the detail-feed
 * XML and every `.7z` / `.7z.NNN` archive part (including any curl `.tmp`
 * partial). Matching is scoped by `item.title` so concurrent items don't
 * clobber each other. Safe to call whether or not the files actually exist.
 */
function cleanItemArtifacts(tempDir: string, item: { id: string; title: string }): void {
	safeRm(join(tempDir, `${item.id}_detail.xml`));
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
function defineFrSubRegion(opts: FrSubRegionOptions): RegionPipeline {
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
			if (existsSync(extractDir)) {
				// Extraction already done in a previous run. Sweep any archive parts
				// that survived an interrupted cleanup so they don't linger forever.
				cleanItemArtifacts(tempDir, item);
				return { extractDir };
			}

			const detailPath = join(tempDir, `${item.id}_detail.xml`);
			await sleep(REQUEST_INTERVAL_MS);
			await withRetry(() => downloadFile(item.detailUrl, detailPath), { maxAttempts: 3 });
			let urls: string[];
			try {
				urls = parseDetailFeed(await readFile(detailPath, 'utf-8'));
			} finally {
				rmSync(detailPath, { force: true });
			}
			if (urls.length === 0) throw new Error(`No .7z archive listed for ${item.id}`);

			const tmpExtractDir = `${extractDir}.tmp`;
			safeRm(tmpExtractDir);

			await downloadFiles(
				urls.map((url) => ({ url, dest: join(tempDir, url.split('/').pop()!) })),
				{
					progress: 'size',
					title: `Downloading ${item.id} (${urls.length} part${urls.length === 1 ? '' : 's'})`,
				},
			);

			// Pick the entry point: the single .7z or the .7z.001 part.
			const mainName = urls
				.find((u) => u.endsWith('.7z') || u.endsWith('.7z.001'))!
				.split('/')
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
				await pipeline(jp2Files, { progress: { labels: ['converted'] } }).forEach(2, async (jp2Path) => {
					const baseName = basename(jp2Path, '.jp2');
					const tifPath = join(tilesDir, `${baseName}.tif`);
					const tilePath = join(tilesDir, `${baseName}.versatiles`);
					try {
						// Decompress JP2 → tiled LZW GeoTIFF first. GDAL's JP2 decoder is
						// more robust than versatiles's; tiled + light compression keeps the
						// intermediate both fast to write and efficient to random-access.
						await convertToTiledTiff(jp2Path, tifPath);
						await runMosaicTile(tifPath, tilePath);
						versatilesFiles.push(tilePath);
						return 'converted';
					} finally {
						safeRm(tifPath);
						safeRm(jp2Path);
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
			safeRm(extractDir);
		},
		minFiles: opts.departmentCodes.length,
	});
}

// ---------------------------------------------------------------------------
// NUTS-1 région → département mapping
// ---------------------------------------------------------------------------

export default [
	{
		name: 'fr/auvergne_rhone_alpes',
		// Ain, Allier, Ardèche, Cantal, Drôme, Isère, Loire, Haute-Loire,
		// Puy-de-Dôme, Rhône, Savoie, Haute-Savoie
		departmentCodes: ['D001', 'D003', 'D007', 'D015', 'D026', 'D038', 'D042', 'D043', 'D063', 'D069', 'D073', 'D074'],
	},
	{
		name: 'fr/bourgogne_franche_comte',
		// Côte-d'Or, Doubs, Jura, Nièvre, Haute-Saône, Saône-et-Loire, Yonne,
		// Territoire de Belfort
		departmentCodes: ['D021', 'D025', 'D039', 'D058', 'D070', 'D071', 'D089', 'D090'],
	},
	{
		name: 'fr/bretagne',
		// Côtes-d'Armor, Finistère, Ille-et-Vilaine, Morbihan
		departmentCodes: ['D022', 'D029', 'D035', 'D056'],
	},
	{
		name: 'fr/centre_val_de_loire',
		// Cher, Eure-et-Loir, Indre, Indre-et-Loire, Loir-et-Cher, Loiret
		departmentCodes: ['D018', 'D028', 'D036', 'D037', 'D041', 'D045'],
	},
	{
		name: 'fr/corse',
		// Corse-du-Sud, Haute-Corse
		departmentCodes: ['D02A', 'D02B'],
	},
	{
		name: 'fr/grand_est',
		// Ardennes, Aube, Marne, Haute-Marne, Meurthe-et-Moselle, Meuse, Moselle,
		// Bas-Rhin, Haut-Rhin, Vosges
		departmentCodes: ['D008', 'D010', 'D051', 'D052', 'D054', 'D055', 'D057', 'D067', 'D068', 'D088'],
	},
	{
		name: 'fr/hauts_de_france',
		// Aisne, Nord, Oise, Pas-de-Calais, Somme
		departmentCodes: ['D002', 'D059', 'D060', 'D062', 'D080'],
	},
	{
		name: 'fr/ile_de_france',
		// Paris, Seine-et-Marne, Yvelines, Essonne, Hauts-de-Seine,
		// Seine-Saint-Denis, Val-de-Marne, Val-d'Oise
		departmentCodes: ['D075', 'D077', 'D078', 'D091', 'D092', 'D093', 'D094', 'D095'],
	},
	{
		name: 'fr/normandie',
		// Calvados, Eure, Manche, Orne, Seine-Maritime
		departmentCodes: ['D014', 'D027', 'D050', 'D061', 'D076'],
	},
	{
		name: 'fr/nouvelle_aquitaine',
		// Charente, Charente-Maritime, Corrèze, Creuse, Dordogne, Gironde, Landes,
		// Lot-et-Garonne, Pyrénées-Atlantiques, Deux-Sèvres, Vienne, Haute-Vienne
		departmentCodes: ['D016', 'D017', 'D019', 'D023', 'D024', 'D033', 'D040', 'D047', 'D064', 'D079', 'D086', 'D087'],
	},
	{
		name: 'fr/occitanie',
		// Ariège, Aude, Aveyron, Gard, Haute-Garonne, Gers, Hérault, Lot, Lozère,
		// Hautes-Pyrénées, Pyrénées-Orientales, Tarn, Tarn-et-Garonne
		departmentCodes: [
			'D009',
			'D011',
			'D012',
			'D030',
			'D031',
			'D032',
			'D034',
			'D046',
			'D048',
			'D065',
			'D066',
			'D081',
			'D082',
		],
	},
	{
		name: 'fr/pays_de_la_loire',
		// Loire-Atlantique, Maine-et-Loire, Mayenne, Sarthe, Vendée
		departmentCodes: ['D044', 'D049', 'D053', 'D072', 'D085'],
	},
	{
		name: 'fr/provence_alpes_cote_d_azur',
		// Alpes-de-Haute-Provence, Hautes-Alpes, Alpes-Maritimes,
		// Bouches-du-Rhône, Var, Vaucluse
		departmentCodes: ['D004', 'D005', 'D006', 'D013', 'D083', 'D084'],
	},
	// DROM (overseas NUTS-1 régions)
	{ name: 'fr/guadeloupe', departmentCodes: ['D971'] },
	{ name: 'fr/martinique', departmentCodes: ['D972'] },
	{ name: 'fr/guyane', departmentCodes: ['D973'] },
	{ name: 'fr/la_reunion', departmentCodes: ['D974'] },
	{ name: 'fr/mayotte', departmentCodes: ['D976'] },
].map(defineFrSubRegion);
