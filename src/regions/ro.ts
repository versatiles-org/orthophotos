import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
	createXmlParser,
	defineTileRegion,
	downloadFile,
	extractZipAndBuildVrt,
	runMosaicTile,
	withRetry,
} from '../lib/index.ts';

const ATOM_URL =
	'https://inspire.geomil.ro/network/rest/directories/arcgisforinspire/INSPIRE/OI_Download_MapServer/OI_Dataset.xml';

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
		releaseDate: '2025-10-05',
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
	downloadLimit: 1,
	download: async ({ url, id }, ctx) => {
		const zipPath = ctx.tempFile(join(ctx.tempDir, `${id}.zip`));
		await withRetry(() => downloadFile(url, zipPath), { maxAttempts: 3 });
		return { zipPath, id };
	},
	convert: async ({ zipPath, id }, ctx) => {
		const extractDir = ctx.tempFile(join(ctx.tempDir, id));
		const vrtPath = ctx.tempFile(join(ctx.tempDir, `${id}.vrt`));
		const { fileCount } = await extractZipAndBuildVrt(zipPath, extractDir, vrtPath);
		if (fileCount === 0) {
			ctx.errors.add(`${id}.zip (no .tif inside)`);
			return;
		}
		await runMosaicTile(vrtPath, ctx.dest);
	},
	minFiles: 123456,
});
