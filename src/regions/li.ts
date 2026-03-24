import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { downloadFile } from '../lib/command.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { runMosaicTile } from '../run/commands.ts';

const DOWNLOAD_URL = 'https://service.geo.llv.li/atom/data/e77da96f-bc1c-4317-8c2f-81310812c798.tif';

export default defineTileRegion({
	name: 'li',
	meta: {
		status: 'success',
		notes: ['License requires attribution.'],
		entries: ['result'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'Amt für Tiefbau und Geoinformation',
			url: 'https://www.opendata.li/de/daten#esc_entry=159&esc_context=24',
		},
		date: '2023',
	},
	init: () => [{ id: 'image' }],
	download: async (_item, { tempDir }) => {
		const src = join(tempDir, 'image.tif');
		await withRetry(() => downloadFile(DOWNLOAD_URL, src), { maxAttempts: 3 });
		return { src };
	},
	convert: async ({ src }, { dest }) => {
		try {
			await runMosaicTile(src, dest);
		} finally {
			try {
				rmSync(src, { force: true });
			} catch {}
		}
	},
	minFiles: 123456,
});
