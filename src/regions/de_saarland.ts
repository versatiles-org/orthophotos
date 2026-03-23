import { existsSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { downloadFile } from '../lib/command.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { isValidRaster } from '../lib/validators.ts';
import { runVersatilesRasterConvert } from '../run/commands.ts';

const ATOM_URL =
	'https://geoportal.saarland.de/mapbender/php/mod_inspireDownloadFeed.php?id=e7995adf-2aeb-4fa4-a536-041e3cc8b24a&type=DATASET&generateFrom=wmslayer&layerid=46747';

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

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
		status: 'success',
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
	download: async ({ url, id }, { tempDir, errors }) => {
		const tifPath = join(tempDir, `${id}.tif`);
		try {
			await withRetry(() => downloadFile(url, tifPath), { maxAttempts: 3 });
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
	minFiles: 123456,
});
