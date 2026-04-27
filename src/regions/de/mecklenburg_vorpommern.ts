import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineTileRegion, downloadFile, downloadRaster, runMosaicTile, withRetry } from '../lib.ts';

const ATOM_URL = 'https://www.geodaten-mv.de/dienste/dop20_atom?type=dataset&id=f94d17fa-b29b-41f7-a4b8-6e10f1aae38e';

export function parseTileUrls(xml: string): { url: string; id: string }[] {
	const tiles: { url: string; id: string }[] = [];
	const pattern = /href="([^"]*dop20rgbi_[^"]*\.tif[^"]*)"/g;
	let match;
	while ((match = pattern.exec(xml)) !== null) {
		const url = match[1].replace(/amp;/g, '');
		const fileMatch = url.match(/file=([^&]+)/);
		if (fileMatch) {
			tiles.push({ url, id: fileMatch[1] });
		}
	}
	return tiles;
}

export default defineTileRegion({
	name: 'de/mecklenburg_vorpommern',
	meta: {
		status: 'released',
		notes: [
			'Server is slow.',
			'License requires attribution.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
		entries: ['result'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'GeoBasis-DE/M-V',
			url: 'https://www.geoportal-mv.de/portal/Suche/Metadatenuebersicht/Details/Downloaddienst%20Digitale%20Orthophotos%2020cm%20MV%20(ATOM_MV_DOP)/0dea084c-5d2f-4aa0-a974-481dcd85a0ab',
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
		return parseTileUrls(xml);
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
	minFiles: 6600,
});
