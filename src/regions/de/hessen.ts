import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	createXmlParser,
	defineTileRegion,
	downloadFile,
	isValidRaster,
	runMosaicTile,
	safeRm,
	withRetry,
} from '../lib.ts';

const ATOM_URL =
	'https://www.geoportal.hessen.de/mapbender/php/mod_inspireDownloadFeed.php?id=0b30f537-3bd0-44d4-83b0-e3c1542ca265&type=DATASET&generateFrom=wmslayer&layerid=54936';

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
			const match = title.match(/Teil (\S+)/);
			if (match && href) {
				tiles.push({ url: href, id: match[1] });
			}
		}
	}
	return tiles;
}

export default defineTileRegion({
	name: 'de/hessen',
	meta: {
		status: 'released',
		notes: [
			'Server is slow.',
			'National license instead of an international standard.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
		entries: ['result'],
		license: {
			name: 'DL-DE->Zero-2.0',
			url: 'https://www.govdata.de/dl-de/zero-2-0',
			requiresAttribution: false,
		},
		creator: {
			name: 'Hessisches Landesamt für Bodenmanagement und Geoinformation',
			url: 'https://opendata.hessen.de/en/dataset/atkis-dop-20',
		},
		date: '2024',
		releaseDate: '2026-03-21',
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
	minFiles: 122000,
});
