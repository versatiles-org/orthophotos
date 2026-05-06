import { existsSync, rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { defineTileRegion, downloadFile, downloadRaster, runMosaicTile, withRetry } from '../lib/index.ts';

const INDEX_URL =
	'https://s3.storage.pub.lvdc.gov.lv/lgia-opendata/ortofoto_rgb_v6/LGIA_OpenData_Ortofoto_rgb_v6_saites.txt';

export default defineTileRegion({
	name: 'lv',
	meta: {
		status: 'released',
		notes: ['License requires attribution.'],
		entries: ['result'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'Latvijas Ģeotelpiskās informācijas aģentūra',
			url: 'https://www.lgia.gov.lv/lv/aerofotografesanas-6-cikls-2016-2018-g',
		},
		date: '2016-2018',
		mask: 'lv.geojson.gz',
		maskBuffer: -1000,
		releaseDate: '2025-10-04',
	},
	init: async (ctx) => {
		const indexPath = join(ctx.tempDir, 'index.txt');
		if (!existsSync(indexPath)) {
			console.log('  Fetching index...');
			const tmpPath = join(ctx.tempDir, 'index.tmp');
			await withRetry(() => downloadFile(INDEX_URL, tmpPath), { maxAttempts: 3 });
			const content = await readFile(tmpPath, 'utf-8');
			await writeFile(indexPath, content.replace(/\r/g, ''));
			rmSync(tmpPath, { force: true });
		}
		const content = await readFile(indexPath, 'utf-8');
		const urls = content
			.trim()
			.split('\n')
			.filter((u) => u.endsWith('.tif'));
		return urls.map((url) => ({
			id: basename(url, '.tif'),
			url,
			tfwUrl: url.replace(/\.tif$/, '.tfw'),
		}));
	},
	download: async ({ url, tfwUrl, id }, ctx) => {
		const src = ctx.tempFile(join(ctx.tempDir, `${id}.tif`));
		const tfwPath = ctx.tempFile(join(ctx.tempDir, `${id}.tfw`));
		const result = await downloadRaster(url, src, ctx.errors, `${id}.tif`);
		if (result === 'invalid') return 'invalid';
		await withRetry(() => downloadFile(tfwUrl, tfwPath), { maxAttempts: 3 });
		return { src, tfwPath };
	},
	convert: async ({ src }, { dest }) => {
		await runMosaicTile(src, dest);
	},
	minFiles: 123456,
});
