import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { downloadFile } from '../lib/command.ts';
import { safeRm } from '../lib/fs.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { RemoteZip } from '../lib/remote-zip.ts';
import { withRetry } from '../lib/retry.ts';
import { runMosaicTile } from '../run/commands.ts';

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

interface SkItem {
	id: string;
	zipUrl: string;
	entryFilename: string;
	[key: string]: unknown;
}

export default defineTileRegion({
	name: 'sk',
	meta: {
		status: 'scraping',
		notes: [
			'Images are unnecessarily packed into container files, such as ZIP.',
			'License requires attribution.',
			'ZIP files are read remotely via HTTP range requests.',
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
	download: async (item, { tempDir }) => {
		const { zipUrl, entryFilename } = item as SkItem;
		const tifPath = join(tempDir, `${item.id}.tif`);

		const zip = await RemoteZip.open(zipUrl);
		const entry = zip.getEntries().find((e) => e.filename === entryFilename);
		if (!entry) throw new Error(`Entry "${entryFilename}" not found in ${zipUrl}`);

		await zip.extractToFile(entry, tifPath);
		return { tifPath };
	},
	convert: async ({ tifPath }, { dest }) => {
		try {
			await runMosaicTile(tifPath, dest, { crs: '3046' });
		} finally {
			safeRm(tifPath);
		}
	},
	minFiles: 40,
});
