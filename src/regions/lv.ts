import { existsSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { downloadFile } from '../lib/command.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { runMosaicTile } from '../run/commands.ts';

const INDEX_URL =
	'https://s3.storage.pub.lvdc.gov.lv/lgia-opendata/ortofoto_rgb_v6/LGIA_OpenData_Ortofoto_rgb_v6_saites.txt';

export default defineTileRegion({
	name: 'lv',
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
			name: 'Latvijas Ģeotelpiskās informācijas aģentūra',
			url: 'https://www.lgia.gov.lv/lv/aerofotografesanas-6-cikls-2016-2018-g',
		},
		date: '2016-2018',
	},
	init: async (ctx) => {
		const indexPath = join(ctx.tempDir, 'index.txt');
		if (!existsSync(indexPath)) {
			console.log('  Fetching index...');
			const tmpPath = join(ctx.tempDir, 'index.tmp');
			await withRetry(() => downloadFile(INDEX_URL, tmpPath), { maxAttempts: 3 });
			const content = await readFile(tmpPath, 'utf-8');
			const { writeFile } = await import('node:fs/promises');
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
	download: async ({ url, tfwUrl, id }, { tempDir }) => {
		const src = join(tempDir, `${id}.tif`);
		const tfwPath = join(tempDir, `${id}.tfw`);
		await withRetry(() => downloadFile(url as string, src), { maxAttempts: 3 });
		await withRetry(() => downloadFile(tfwUrl as string, tfwPath), { maxAttempts: 3 });
		return { src, tfwPath };
	},
	convert: async ({ src, tfwPath }, { dest }) => {
		try {
			await runMosaicTile(src, dest);
		} finally {
			for (const p of [src, tfwPath]) {
				try {
					rmSync(p, { force: true });
				} catch {}
			}
		}
	},
	minFiles: 123456,
});
