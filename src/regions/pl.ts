import { existsSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { downloadFile, runCommand } from '../lib/command.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { isValidRaster } from '../lib/validators.ts';
import { runVersatilesRasterConvert } from '../run/commands.ts';

const DATASET_FEED_URL =
	'https://mapy.geoportal.gov.pl/wss/service/ATOM/httpauth/atom/OI?spatial_dataset_identifier_code=OI&spatial_dataset_identifier_namespace=PL.PZGiK.203';

const MIN_YEAR = 2020;

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

interface YearEntry {
	year: number;
	url: string;
}

/**
 * Parse the dataset Atom feed to extract per-year ZIP download URLs.
 * Returns entries sorted newest-first, filtered to MIN_YEAR and later.
 */
export function parseDatasetFeed(xml: string): YearEntry[] {
	const parsed = xmlParser.parse(xml);
	const entry = parsed.feed?.entry;
	if (!entry) return [];

	const links: unknown[] = [(entry as Record<string, unknown>).link ?? []].flat();
	const entries: YearEntry[] = [];

	for (const link of links) {
		const attrs = link as Record<string, string>;
		const href = (attrs['@_href'] ?? '').replace(/&amp;/g, '&');
		const match = href.match(/name=polska_oi_(\d{4})\.zip/);
		if (match && href) {
			const year = Number(match[1]);
			if (year >= MIN_YEAR) {
				entries.push({ year, url: href });
			}
		}
	}

	entries.sort((a, b) => b.year - a.year);
	return entries;
}

/**
 * Extract TIF download URLs from a GML file inside a ZIP archive.
 * Uses unzip | grep in a shell pipeline to avoid loading huge GML files into Node memory.
 */
async function extractUrlsFromGmlZip(zipPath: string): Promise<string[]> {
	const result = await runCommand(
		'sh',
		[
			'-c',
			`unzip -p '${zipPath}' | grep -oE 'https://opendata\\.geoportal\\.gov\\.pl/ortofotomapa/[^<"]+\\.tif' | sort -u`,
		],
		{ stdout: 'piped' },
	);
	const output = new TextDecoder().decode(result.stdout).trim();
	if (output.length === 0) return [];
	return output.split('\n');
}

/**
 * Extract the grid cell reference from a TIF URL.
 * URL pattern: .../ortofotomapa/{operatId}/{operatId}_{tileId}_{gridRef}.tif
 * The grid ref (e.g. "N-34-126-C-b-1-3") identifies the location.
 */
function extractGridRef(url: string): string {
	const filename = url.split('/').pop()?.replace('.tif', '') ?? '';
	// Remove the first two numeric segments: {operatId}_{tileId}_
	return filename.replace(/^\d+_\d+_/, '');
}

export default defineTileRegion({
	name: 'pl',
	meta: {
		status: 'success',
		notes: ['No access restrictions.', 'Atom feed provides GML per year; each GML lists individual GeoTIFF URLs.'],
		entries: ['result'],
		license: {
			name: 'CC0',
			url: 'https://creativecommons.org/publicdomain/zero/1.0/',
			requiresAttribution: false,
		},
		creator: {
			name: 'Główny Urząd Geodezji i Kartografii',
			url: 'https://www.geoportal.gov.pl/en/data/orthophotomap-orto/',
		},
		date: `${MIN_YEAR}-2021`,
	},
	init: async (ctx) => {
		const feedPath = join(ctx.tempDir, 'dataset_feed.xml');
		if (!existsSync(feedPath)) {
			console.log('  Fetching dataset Atom feed...');
			await withRetry(() => downloadFile(DATASET_FEED_URL, feedPath), { maxAttempts: 3 });
		}

		const feedXml = await readFile(feedPath, 'utf-8');
		const years = parseDatasetFeed(feedXml);
		console.log(`  Found ${years.length} year entries (>= ${MIN_YEAR})`);

		// For each grid cell, keep only the most recent URL.
		// Process years newest-first so the first occurrence wins.
		const bestByGrid = new Map<string, { url: string; gridRef: string }>();

		for (const { year, url } of years) {
			const zipPath = join(ctx.tempDir, `polska_oi_${year}.zip`);
			if (!existsSync(zipPath)) {
				console.log(`  Downloading GML for ${year}...`);
				await withRetry(() => downloadFile(url, zipPath), { maxAttempts: 3 });
			}

			const urls = await extractUrlsFromGmlZip(zipPath);
			let added = 0;
			for (const tifUrl of urls) {
				const gridRef = extractGridRef(tifUrl);
				if (!bestByGrid.has(gridRef)) {
					bestByGrid.set(gridRef, { url: tifUrl, gridRef });
					added++;
				}
			}
			console.log(`  ${year}: ${urls.length} tiles, ${added} new grid cells (total: ${bestByGrid.size})`);
		}

		return [...bestByGrid.values()].map(({ url, gridRef }) => ({ id: gridRef, url }));
	},
	downloadConcurrency: 1,
	download: async ({ url, id }, { tempDir, errors }) => {
		const tifPath = join(tempDir, `${id}.tif`);
		try {
			console.log(`  Downloading ${url}`);
			await withRetry(() => downloadFile(url, tifPath), { maxAttempts: 5, initialDelayMs: 3000 });
			if (!(await isValidRaster(tifPath))) {
				errors.add(`${id}.tif (${url})`);
				return 'invalid';
			}
			return { tifPath };
		} catch (err) {
			try {
				rmSync(tifPath, { force: true });
			} catch {}
			throw err;
		}
	},
	convert: async ({ tifPath }, { dest }) => {
		try {
			await runVersatilesRasterConvert(tifPath, dest);
		} finally {
			try {
				rmSync(tifPath, { force: true });
			} catch {}
		}
	},
	minFiles: 330000,
});
