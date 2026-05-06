import { join } from 'node:path';
import { defineTileRegion, downloadRaster, runMosaicTile } from '../lib/index.ts';

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
		releaseDate: '2026-04-23',
	},
	init: () => [{ id: 'image', url: DOWNLOAD_URL }],
	download: async ({ url, id }, ctx) => {
		const src = ctx.tempFile(join(ctx.tempDir, `${id}.tif`));
		const result = await downloadRaster(url, src, ctx.errors, `${id}.tif`);
		if (result === 'invalid') return 'invalid';
		return { src };
	},
	convert: async ({ src }, { dest }) => {
		await runMosaicTile(src, dest);
	},
	minFiles: 1,
});
