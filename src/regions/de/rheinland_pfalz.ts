import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { defineTileRegion, isValidRaster, runCommand, runMosaicTile, withRetry } from '../../lib/index.ts';

const INDEX_URL = 'https://geobasis-rlp.de/data/dop20rgb/current/jp2/';

export function parseFilenames(html: string): string[] {
	const pattern = /href="([^"]+\.jp2)"/g;
	const filenames: string[] = [];
	let match;
	while ((match = pattern.exec(html)) !== null) {
		filenames.push(match[1]);
	}
	return filenames;
}

export default defineTileRegion({
	name: 'de/rheinland_pfalz',
	meta: {
		status: 'released',
		notes: [
			'No API, such as an ATOM feed, available.',
			'Parsing HTML is required.',
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
			name: 'GeoBasis-DE / LVermGeoRP 2025, www.lvermgeo.rlp.de',
			url: 'https://geoshop.rlp.de/opendata-dop20.html',
		},
		date: '2025',
		releaseDate: '2026-03-21',
	},
	init: async (ctx) => {
		const indexPath = join(ctx.tempDir, 'index.html');
		if (!existsSync(indexPath)) {
			console.log('  Fetching index...');
			await withRetry(() => runCommand('curl', ['-sko', indexPath, INDEX_URL]), { maxAttempts: 3 });
		}
		const html = await readFile(indexPath, 'utf-8');
		const filenames = parseFilenames(html);
		return filenames.map((f) => ({ id: basename(f, '.jp2'), url: `${INDEX_URL}${f}` }));
	},
	download: async ({ url, id }, ctx) => {
		const src = ctx.tempFile(join(ctx.tempDir, `${id}.jp2`));
		// `-k` (insecure) is required because the server's TLS certificate is not trusted by curl.
		await withRetry(() => runCommand('curl', ['-sko', src, url]), { maxAttempts: 3 });
		if (!(await isValidRaster(src))) {
			ctx.errors.add(`${id}.jp2 (${url})`);
			return 'invalid';
		}
		return { src };
	},
	convert: async ({ src }, { dest }) => {
		await runMosaicTile(src, dest);
	},
	minFiles: 5200,
});
