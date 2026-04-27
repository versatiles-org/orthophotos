import { rmSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineTileRegion, downloadFile, extractZipFile, runMosaicTile, safeRm, withRetry } from '../lib.ts';

export function parseUrlId(url: string): string {
	const match = url.match(/\/(dop20rgb_[^/]+?)_2_sn_tiff\.zip$/);
	return match ? match[1] : '';
}

export default defineTileRegion({
	name: 'de/sachsen',
	meta: {
		status: 'released',
		notes: [
			'The URLs in the Atom feed point to old files that no longer exist.',
			'Images are unnecessarily packed into container files, such as ZIP.',
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
			name: 'GeoSN',
			url: 'https://www.geodaten.sachsen.de/luftbild-produkte-3995.html',
		},
		date: '2024',
		releaseDate: '2026-03-23',
	},
	init: async () => {
		const urlsPath = join(dirname(fileURLToPath(import.meta.url)), 'de_sachsen.txt');
		const content = await readFile(urlsPath, 'utf-8');
		const urls = content.trim().split('\n').filter(Boolean);
		return urls.map((url) => ({ id: parseUrlId(url), url })).filter((item) => item.id !== '');
	},
	download: async ({ url, id }, { tempDir }) => {
		const zipPath = join(tempDir, `${id}.zip`);
		const extractDir = join(tempDir, id);

		await withRetry(() => downloadFile(url, zipPath), { maxAttempts: 3 });
		await extractZipFile(zipPath, extractDir);
		rmSync(zipPath, { force: true });

		// Find the TIF file
		const files = await readdir(extractDir, { recursive: true });
		const tifFile = files.find((f) => typeof f === 'string' && f.endsWith('.tif'));
		if (!tifFile) return 'empty';

		return { tifPath: join(extractDir, String(tifFile)), extractDir };
	},
	convert: async ({ tifPath, extractDir }, { dest }) => {
		await runMosaicTile(tifPath, dest);
		safeRm(extractDir);
	},
	minFiles: 4900,
});
