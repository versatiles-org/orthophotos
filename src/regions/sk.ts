import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { downloadFile } from '../lib/command.ts';
import { extractZipFile, safeRm } from '../lib/fs.ts';
import { pipeline } from '../lib/pipeline.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { runMosaicAssemble, runMosaicTile } from '../run/commands.ts';

const ATOM_URL = 'https://inspirews.skgeodesy.sk/atom/7efad194-3006-408f-9e6c-c06dc79703bd_dataFeed.atom';

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

export function parseZipUrls(xml: string): { url: string; id: string }[] {
	const parsed = xmlParser.parse(xml);
	const entries: unknown[] = [parsed.feed?.entry ?? []].flat();
	const items: { url: string; id: string }[] = [];
	for (const entry of entries) {
		const links: unknown[] = [(entry as Record<string, unknown>).link ?? []].flat();
		for (const link of links) {
			const attrs = link as Record<string, string>;
			const href = attrs['@_href'] ?? '';
			if (href.endsWith('.zip')) {
				items.push({ url: href, id: basename(href, '.zip').replace(/^orthoimagery_/, '') });
			}
		}
	}
	return items;
}

export default defineTileRegion({
	name: 'sk',
	meta: {
		status: 'scraping',
		notes: ['Images are unnecessarily packed into container files, such as ZIP.', 'License requires attribution.'],
		entries: ['result'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'GKÚ',
			url: 'https://rpi.gov.sk/metadata/3b046df1-7867-4377-b15b-6ae6bac999da',
		},
		date: '2023',
	},
	init: async (ctx) => {
		const atomPath = join(ctx.tempDir, 'index.xml');
		if (!existsSync(atomPath)) {
			console.log('  Fetching atom feed...');
			await withRetry(() => downloadFile(ATOM_URL, atomPath), { maxAttempts: 3 });
		}
		const xml = await readFile(atomPath, 'utf-8');
		const zips = parseZipUrls(xml);
		console.log(`  Found ${zips.length} zip files`);
		return zips;
	},
	downloadConcurrency: 1,
	download: async ({ url, id }, { tempDir }) => {
		const zipPath = join(tempDir, `${id}.zip`);
		console.log(`  Downloading ${id}.zip...`);
		await withRetry(() => downloadFile(url, zipPath), { maxAttempts: 3 });
		return { zipPath };
	},
	convertLimit: { concurrency: 1 },
	convert: async ({ zipPath }, { dest, tempDir }) => {
		const extractDir = join(tempDir, `extract_${Date.now()}`);
		const tilesDir = join(tempDir, `tiles_${Date.now()}`);

		// Extract ZIP
		console.log(`  Extracting ${basename(zipPath)}...`);
		await extractZipFile(zipPath, extractDir);
		safeRm(zipPath);

		// Find all TIF files
		const files = await readdir(extractDir, { recursive: true });
		const tifFiles = files
			.map((f) => (typeof f === 'string' ? f : String(f)))
			.filter((f) => f.endsWith('.tif'))
			.map((f) => join(extractDir, f));

		if (tifFiles.length === 0) {
			throw new Error(`No TIF files found in ${extractDir}`);
		}

		// Convert each TIF to a .versatiles container individually
		mkdirSync(tilesDir, { recursive: true });
		console.log(`  Converting ${tifFiles.length} TIF files...`);
		const versatilesFiles: string[] = [];
		await pipeline(tifFiles, { progress: { labels: ['converted'] } }).forEach(4, async (tifPath) => {
			const tileName = basename(tifPath, '.tif') + '.versatiles';
			const tilePath = join(tilesDir, tileName);
			await runMosaicTile(tifPath, tilePath, { crs: '3046' });
			versatilesFiles.push(tilePath);
			return 'converted';
		});

		// Assemble all per-file containers into one
		const filelistPath = join(tempDir, 'filelist.txt');
		writeFileSync(filelistPath, versatilesFiles.join('\n'));
		await runMosaicAssemble(filelistPath, dest, { lossless: true });
		safeRm(filelistPath);
	},
	minFiles: 3,
});
