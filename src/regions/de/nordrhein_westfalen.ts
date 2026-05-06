import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { defineTileRegion, downloadFile, downloadRaster, runMosaicTile, withRetry } from '../../lib/region-api.ts';

const INDEX_URL = 'https://www.opengeodata.nrw.de/produkte/geobasis/lusat/akt/dop/dop_jp2_f10/';

export function parseFilenames(html: string): string[] {
	const pattern = /file name="(dop[^"]*\.jp2)"/g;
	const filenames: string[] = [];
	let match;
	while ((match = pattern.exec(html)) !== null) {
		filenames.push(match[1]);
	}
	return filenames;
}

export default defineTileRegion({
	name: 'de/nordrhein_westfalen',
	meta: {
		status: 'released',
		notes: [
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
			name: 'Geobasis NRW',
			url: 'https://www.opengeodata.nrw.de/produkte/geobasis/lusat/akt/dop/dop_jp2_f10/',
		},
		date: '2025',
		releaseDate: '2026-03-22',
	},
	init: async (ctx) => {
		const indexPath = join(ctx.tempDir, 'index.xml');
		if (!existsSync(indexPath)) {
			console.log('  Fetching index...');
			await withRetry(() => downloadFile(INDEX_URL, indexPath), { maxAttempts: 3 });
		}
		const html = await readFile(indexPath, 'utf-8');
		const filenames = parseFilenames(html);
		return filenames.map((f) => ({ id: basename(f, '.jp2'), url: `${INDEX_URL}${f}` }));
	},
	download: async ({ url, id }, ctx) => {
		const src = ctx.tempFile(join(ctx.tempDir, `${id}.jp2`));
		const result = await downloadRaster(url, src, ctx.errors, `${id}.jp2`);
		if (result === 'invalid') return 'invalid';
		return { src };
	},
	convert: async ({ src }, { dest }) => {
		await runMosaicTile(src, dest);
	},
	minFiles: 36000,
});
