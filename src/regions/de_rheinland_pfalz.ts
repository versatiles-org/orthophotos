import { existsSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { runCommand } from '../lib/command.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { runVersatilesRasterConvert } from '../run/commands.ts';

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
		status: 'success',
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
	download: async ({ url, id }, { dest, tempDir }) => {
		const tmpPath = join(tempDir, `${id}.jp2`);
		try {
			await withRetry(() => runCommand('curl', ['-sko', tmpPath, url]), { maxAttempts: 3 });
			await runVersatilesRasterConvert(tmpPath, dest);
		} finally {
			try {
				rmSync(tmpPath, { force: true });
			} catch {}
		}
	},
	minFiles: 123456,
});
