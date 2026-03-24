import { existsSync, rmSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { downloadFile } from '../lib/command.ts';
import { extractZipFile } from '../lib/fs.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { runMosaicTile } from '../run/commands.ts';

const BASE_URL = 'https://data.geobasis-bb.de/geobasis/daten/dop/rgb_jpg/';

export function parseZipFilenames(html: string): string[] {
	const pattern = /href="(dop_[^"]+\.zip)"/g;
	const filenames = new Set<string>();
	let match;
	while ((match = pattern.exec(html)) !== null) {
		filenames.add(match[1]);
	}
	return [...filenames];
}

export default defineTileRegion({
	name: 'de/brandenburg',
	meta: {
		status: 'released',
		notes: [
			'No API, such as an ATOM feed, available.',
			'Parsing HTML is required.',
			'Images are unnecessarily packed into container files, such as ZIP.',
			'Server is very slow.',
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
			name: 'GeoBasis-DE/LGB; Geoportal Berlin',
			url: 'https://data.geobasis-bb.de/geobasis/daten/dop/rgb_jpg/',
		},
		date: '2023',
	},
	init: async (ctx) => {
		const indexPath = join(ctx.tempDir, 'index.html');
		if (!existsSync(indexPath)) {
			console.log('  Fetching index.html...');
			await withRetry(() => downloadFile(BASE_URL, indexPath), { maxAttempts: 3 });
		}
		const html = await readFile(indexPath, 'utf-8');
		const filenames = parseZipFilenames(html);
		return filenames.map((f) => ({ id: basename(f, '.zip'), url: `${BASE_URL}${f}` }));
	},
	download: async ({ url, id }, { tempDir }) => {
		const zipPath = join(tempDir, `${id}.zip`);
		const extractDir = join(tempDir, id);

		try {
			await withRetry(() => downloadFile(url, zipPath), { maxAttempts: 3 });
			await extractZipFile(zipPath, extractDir);

			// Find the .jpg file (GDAL reads .jgw sidecar automatically for georeferencing)
			const files = await readdir(extractDir, { recursive: true });
			const jpgFile = files.find((f) => typeof f === 'string' && f.endsWith('.jpg'));
			if (!jpgFile) return 'empty';

			return { jpgPath: join(extractDir, String(jpgFile)), extractDir };
		} catch (err) {
			try {
				rmSync(extractDir, { recursive: true, force: true });
			} catch {}
			throw err;
		} finally {
			try {
				rmSync(zipPath, { force: true });
			} catch {}
		}
	},
	convert: async ({ jpgPath, extractDir }, { dest }) => {
		try {
			await runMosaicTile(jpgPath, dest);
		} finally {
			try {
				rmSync(extractDir, { recursive: true, force: true });
			} catch {}
		}
	},
	minFiles: 32000,
});
