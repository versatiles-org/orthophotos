import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	createXmlParser,
	defineTileRegion,
	downloadFile,
	downloadRaster,
	runMosaicTile,
	withRetry,
} from '../../lib/index.ts';

const ATOM_URL =
	'https://geoportal.saarland.de/mapbender/php/mod_inspireDownloadFeed.php?id=e7995adf-2aeb-4fa4-a536-041e3cc8b24a&type=DATASET&generateFrom=wmslayer&layerid=46747';

const xmlParser = createXmlParser();

export function parseAtomEntries(xml: string): { url: string; id: string }[] {
	const parsed = xmlParser.parse(xml);
	const entries: unknown[] = [parsed.feed?.entry ?? []].flat();
	const tiles: { url: string; id: string }[] = [];
	for (const entry of entries) {
		const links: unknown[] = [(entry as Record<string, unknown>).link ?? []].flat();
		for (const link of links) {
			const attrs = link as Record<string, string>;
			const href = (attrs['@_href'] ?? '').replace(/amp;/g, '');
			const title = attrs['@_title'] ?? '';
			if (href.includes('mapbender')) continue;
			const match = title.match(/Teil (\S+)/);
			if (match && href) {
				tiles.push({ url: href, id: match[1] });
			}
		}
	}
	return tiles;
}

export default defineTileRegion({
	name: 'de/saarland',
	meta: {
		status: 'released',
		notes: [
			'Server is slow.',
			'License requires attribution.',
			'National license instead of an international standard.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
		entries: ['result'],
		license: {
			name: 'DL-DE->BY-2.0',
			url: 'https://www.govdata.de/dl-de/by-2-0',
			requiresAttribution: true,
		},
		creator: {
			name: 'GeoBasis DE/LVGL-SL (2025)',
			url: 'https://geoportal.saarland.de/app-article/geobasisdatenuebersicht/',
		},
		date: '2023',
		releaseDate: '2026-03-22',
	},
	init: async (ctx) => {
		const atomPath = join(ctx.tempDir, 'atom.xml');
		if (!existsSync(atomPath)) {
			console.log('  Fetching atom.xml...');
			await withRetry(() => downloadFile(ATOM_URL, atomPath), { maxAttempts: 3 });
		}
		const xml = await readFile(atomPath, 'utf-8');
		return parseAtomEntries(xml);
	},
	download: async ({ url, id }, ctx) => {
		const tifPath = ctx.tempFile(join(ctx.tempDir, `${id}.tif`));
		const result = await downloadRaster(url, tifPath, ctx.errors, `${id}.tif`);
		if (result === 'invalid') return 'invalid';
		return { tifPath };
	},
	convert: async ({ tifPath }, { dest }) => {
		await runMosaicTile(tifPath, dest);
	},
	minFiles: 19000,
});
