import { existsSync, rmSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { downloadFile, runCommand } from '../lib/command.ts';
import { extractZipFile } from '../lib/fs.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { runMosaicTile } from '../run/commands.ts';

const ATOM_URL =
	'https://inspire.geomil.ro/network/rest/directories/arcgisforinspire/INSPIRE/OI_Download_MapServer/OI_Dataset.xml';

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
				items.push({ url: href, id: basename(href, '.zip') });
			}
		}
	}
	return items;
}

export default defineTileRegion({
	name: 'ro',
	meta: {
		status: 'released',
		notes: ['Images are unnecessarily packed into container files, such as ZIP.', 'License requires attribution.'],
		entries: ['result'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'Agenția de Informații Geospațiale a Apărării',
			url: 'https://data.gov.ro/en/dataset/ortofotoplan-scara-1-5000-pentru-teritoriul-romaniei',
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
		return parseZipUrls(xml);
	},
	downloadConcurrency: 1,
	download: async ({ url, id }, { tempDir }) => {
		const zipPath = join(tempDir, `${id}.zip`);
		const extractDir = join(tempDir, id);

		try {
			await withRetry(() => downloadFile(url, zipPath), { maxAttempts: 3 });
			await extractZipFile(zipPath, extractDir);
			rmSync(zipPath, { force: true });

			const files = await readdir(extractDir);
			const tifFiles = files.filter((f) => f.endsWith('.tif'));
			if (tifFiles.length === 0) return 'empty';

			const vrtPath = join(tempDir, `${id}.vrt`);
			await runCommand('gdalbuildvrt', ['-q', vrtPath, ...tifFiles.map((f) => join(extractDir, f))]);

			return { vrtPath, extractDir };
		} catch (err) {
			try {
				rmSync(zipPath, { force: true });
			} catch {}
			try {
				rmSync(extractDir, { recursive: true, force: true });
			} catch {}
			throw err;
		}
	},
	convert: async ({ vrtPath, extractDir }, { dest }) => {
		try {
			await runMosaicTile(vrtPath, dest);
		} finally {
			try {
				rmSync(vrtPath, { force: true });
			} catch {}
			try {
				rmSync(extractDir, { recursive: true, force: true });
			} catch {}
		}
	},
	minFiles: 123456,
});
