import { existsSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { downloadFile } from '../lib/command.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { runVersatilesRasterConvert } from '../run/commands.ts';

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
		status: 'success',
		notes: [
			'National license instead of an international standard.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
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
	download: async ({ url, id }, { dest, tempDir }) => {
		const jp2Path = join(tempDir, `${id}.jp2`);
		try {
			await withRetry(() => downloadFile(url, jp2Path), { maxAttempts: 3 });
			await runVersatilesRasterConvert(jp2Path, dest);
		} finally {
			try {
				rmSync(jp2Path, { force: true });
			} catch {}
		}
	},
	minFiles: 50,
});
