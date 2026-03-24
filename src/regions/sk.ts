import { existsSync, rmSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { downloadFile } from '../lib/command.ts';
import { extractZipFile } from '../lib/fs.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
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

export default defineTileRegion({
	name: 'sk',
	meta: {
		status: 'error',
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

		// Download and extract all ZIPs, collect TIF paths
		const xml = await readFile(atomPath, 'utf-8');
		const zips = parseZipUrls(xml);
		console.log(`  Found ${zips.length} zip files`);

		const items: { id: string; tifPath: string }[] = [];

		for (const { url, id } of zips) {
			const extractDir = join(ctx.tempDir, id);
			if (!existsSync(extractDir)) {
				const zipPath = join(ctx.tempDir, `${id}.zip`);
				console.log(`  Downloading ${id}...`);
				await withRetry(() => downloadFile(url, zipPath), { maxAttempts: 3 });
				await extractZipFile(zipPath, extractDir);
				rmSync(zipPath, { force: true });
			}

			const files = await readdir(extractDir, { recursive: true });
			for (const file of files) {
				const name = typeof file === 'string' ? file : String(file);
				if (!name.endsWith('.tif')) continue;
				const tifPath = join(extractDir, name);
				items.push({ id: basename(name, '.tif'), tifPath });
			}
		}

		return items;
	},
	download: async ({ tifPath }) => {
		return { src: tifPath as string };
	},
	convert: async ({ src }, { dest }) => {
		await runMosaicTile(src, dest, { crs: '3046' });
	},
	minFiles: 123456,
});
