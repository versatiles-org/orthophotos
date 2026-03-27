import { join } from 'node:path';
import { downloadFile } from '../lib/command.ts';
import { safeRm } from '../lib/fs.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { runMosaicTile } from '../run/commands.ts';

const DOWNLOAD_URL = 'https://service.geo.llv.li/atom/data/e77da96f-bc1c-4317-8c2f-81310812c798.tif';

export default defineTileRegion({
	name: 'li',
	meta: {
		status: 'released',
		notes: ['License requires attribution.'],
		entries: ['result'],
		license: {
			name: 'Opendata BY',
			url: 'https://www.opendata.li/de/nutzungsbedingungen',
			requiresAttribution: true,
		},
		creator: {
			name: 'Liechtensteinische Landesverwaltung',
			url: 'https://www.opendata.li/de/daten',
		},
		date: '2022',
		releaseDate: '2026-03-24',
	},
	init: () => [{ id: 'image', url: DOWNLOAD_URL }],
	download: async ({ url }, { tempDir }) => {
		const src = join(tempDir, 'image.tif');
		await withRetry(() => downloadFile(url, src), { maxAttempts: 3 });
		return { src };
	},
	convert: async ({ src }, { dest }) => {
		await runMosaicTile(src, dest);
		safeRm(src);
	},
	minFiles: 1,
});
