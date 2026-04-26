import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { defineTileRegion, downloadFile, isValidRaster, runMosaicTile, safeRm, withRetry } from './lib.ts';

const ATOM_URL =
	'https://geodatenportal.sachsen-anhalt.de/arcgisinspire/rest/directories/web/INSPIRE_ALKIS/ALKIS_OI_DOP20_MapServer/datasetoi.xml';
const DOWNLOAD_BASE = 'https://www.geodatenportal.sachsen-anhalt.de/gfds_webshare/sec-download/LVermGeo/DOP20/';

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

export function parseTileIds(xml: string): string[] {
	const parsed = xmlParser.parse(xml);
	const entries: unknown[] = [parsed.feed?.entry ?? []].flat();
	const ids = new Set<string>();
	for (const entry of entries) {
		const links: unknown[] = [(entry as Record<string, unknown>).link ?? []].flat();
		for (const link of links) {
			const attrs = link as Record<string, string>;
			const href = (attrs['@_href'] ?? '').replace(/amp;/g, '');
			const matches = href.match(/\d+/g);
			if (matches) {
				for (const m of matches) {
					if (m.length >= 4) ids.add(m);
				}
			}
		}
	}
	return [...ids];
}

export default defineTileRegion({
	name: 'de/sachsen_anhalt',
	meta: {
		status: 'released',
		notes: [
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
			name: 'GeoBasis-DE / LVermGeo ST',
			url: 'https://www.lvermgeo.sachsen-anhalt.de/de/gdp-open-data.html',
		},
		date: '2020',
		releaseDate: '2026-03-23',
	},
	init: async (ctx) => {
		const atomPath = join(ctx.tempDir, 'atom.xml');
		if (!existsSync(atomPath)) {
			console.log('  Fetching atom.xml...');
			await withRetry(() => downloadFile(ATOM_URL, atomPath), { maxAttempts: 3 });
		}
		const xml = await readFile(atomPath, 'utf-8');
		const ids = parseTileIds(xml);
		return ids.map((id) => ({ id, url: `${DOWNLOAD_BASE}${id}.tif` }));
	},
	download: async ({ url, id }, { tempDir, errors }) => {
		const tifPath = join(tempDir, `${id}.tif`);

		await withRetry(() => downloadFile(url, tifPath), { maxAttempts: 3 });
		if (!(await isValidRaster(tifPath))) {
			errors.add(`${id}.tif (${url})`);
			return 'invalid';
		}
		return { tifPath };
	},
	convert: async ({ tifPath }, { dest }) => {
		await runMosaicTile(tifPath, dest);
		safeRm(tifPath);
	},
	minFiles: 5400,
});
