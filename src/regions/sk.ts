import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
	convertToTiledTiff,
	createXmlParser,
	defineTileRegion,
	downloadFile,
	isValidRaster,
	RemoteZip,
	runMosaicTile,
	safeRm,
	withRetry,
} from './lib.ts';

const ATOM_URL = 'https://inspirews.skgeodesy.sk/atom/7efad194-3006-408f-9e6c-c06dc79703bd_dataFeed.atom';

const xmlParser = createXmlParser();

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

interface SkItem {
	id: string;
	zipUrl: string;
	entryFilename: string;
}

export default defineTileRegion<SkItem, { tifPath: string }>({
	name: 'sk',
	meta: {
		status: 'released',
		notes: [
			'Images are unnecessarily packed into container files, such as ZIP.',
			'Filenames do not follow a positional naming convention.',
			'License requires attribution.',
		],
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
		releaseDate: '2026-03-28',
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

		// Read the Central Directory of each ZIP via HTTP range requests
		const items: SkItem[] = [];
		for (const { url, id } of zips) {
			console.log(`  Reading contents of ${id}.zip...`);
			const zip = await RemoteZip.open(url);
			for (const entry of zip.getEntries()) {
				if (!entry.filename.endsWith('.tif')) continue;
				const tifName = basename(entry.filename, '.tif');
				items.push({ id: tifName, zipUrl: url, entryFilename: entry.filename });
			}
			console.log(`    ${items.length} TIF files so far`);
		}

		return items;
	},
	download: async (item, ctx) => {
		const { zipUrl, entryFilename } = item;
		const rawPath = join(ctx.tempDir, `${item.id}_raw.tif`);
		const rawTfwPath = rawPath.replace(/\.tif$/, '.tfw');
		const tifPath = ctx.tempFile(join(ctx.tempDir, `${item.id}.tif`));

		const zip = await RemoteZip.open(zipUrl);

		// Extract the TIF
		const tifEntry = zip.getEntries().find((e) => e.filename === entryFilename);
		if (!tifEntry) throw new Error(`Entry "${entryFilename}" not found in ${zipUrl}`);
		await zip.extractToFile(tifEntry, rawPath);

		// Also extract the worldfile (.tfw) for georeferencing
		const tfwFilename = entryFilename.replace(/\.tif$/, '.tfw');
		const tfwEntry = zip.getEntries().find((e) => e.filename === tfwFilename);
		if (tfwEntry) {
			const tfwData = await zip.extract(tfwEntry);
			const { writeFileSync } = await import('node:fs');
			writeFileSync(rawTfwPath, tfwData);
		}

		try {
			// Convert to tiled GeoTIFF for faster random access
			await convertToTiledTiff(rawPath, tifPath);
		} finally {
			// rawPath is a download-stage scratch file; free space before convert runs.
			safeRm(rawPath);
			safeRm(rawTfwPath);
		}

		if (!(await isValidRaster(tifPath))) {
			ctx.errors.add(`${item.id}.tif`);
			return 'invalid';
		}

		return { tifPath };
	},
	convertLimit: { memoryGB: 20 },
	convert: async ({ tifPath }, { dest }) => {
		await runMosaicTile(tifPath, dest, { crs: '3046', nodata: '0,0,0;255,255,255' });
	},
	minFiles: 40,
});
