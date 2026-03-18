import { existsSync, mkdirSync, rmSync, renameSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineRegion, step } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { shuffle } from '../lib/array.ts';
import { downloadFile, runCommand } from '../lib/command.ts';
import { CONCURRENCY, concurrent } from '../lib/concurrent.ts';
import { withRetry } from '../lib/retry.ts';

export function parseUrlId(url: string): string {
	const match = url.match(/\/(dop20rgb_[^/]+?)_2_sn_tiff\.zip$/);
	return match ? match[1] : '';
}

export default defineRegion(
	'de/sachsen',
	{
		status: 'success',
		notes: [
			'The URLs in the Atom feed point to old files that no longer exist.',
			'Images are unnecessarily packed into container files, such as ZIP.',
			'License requires attribution.',
			'National license instead of an international standard.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
		entries: ['tiles'],
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
		vrt: {},
	},
	[
		step('download-tiles', async (ctx) => {
			const tilesDir = join(ctx.dataDir, 'tiles');
			mkdirSync(tilesDir, { recursive: true });

			const urlsPath = join(dirname(fileURLToPath(import.meta.url)), 'de_sachsen.txt');
			const content = await readFile(urlsPath, 'utf-8');
			const urls = content.trim().split('\n').filter(Boolean);
			console.log(`  Found ${urls.length} tile URLs`);

			await concurrent(
				shuffle(urls),
				CONCURRENCY,
				async (url) => {
					const id = parseUrlId(url);
					if (!id) return 'empty';

					const destJp2 = join(tilesDir, `${id}.jp2`);
					if (existsSync(destJp2)) return 'skipped';

					const zipPath = join(ctx.tempDir, `${id}.zip`);
					const tifPath = join(ctx.tempDir, `${id}_2_sn.tif`);
					const jp2Path = join(ctx.tempDir, `${id}.jp2`);

					try {
						await withRetry(() => downloadFile(url, zipPath), { maxAttempts: 3 });
						await runCommand('unzip', ['-qo', zipPath, '-d', ctx.tempDir]);
						rmSync(zipPath, { force: true });

						await runCommand('gdal', ['raster', 'edit', '--nodata', '255', tifPath]);
						await runCommand('gdal_translate', [
							'-q',
							'-b',
							'1',
							'-b',
							'2',
							'-b',
							'3',
							'-b',
							'mask',
							'-colorinterp_4',
							'alpha',
							tifPath,
							jp2Path,
						]);

						renameSync(jp2Path, destJp2);
						return 'converted';
					} finally {
						for (const p of [zipPath, tifPath, jp2Path]) {
							try {
								rmSync(p, { force: true });
							} catch {}
						}
						// Clean up any other extracted files
						try {
							const pattern = `${id}`;
							const { readdir } = await import('node:fs/promises');
							for (const f of await readdir(ctx.tempDir)) {
								if (f.startsWith(pattern)) {
									try {
										rmSync(join(ctx.tempDir, f), { force: true });
									} catch {}
								}
							}
						} catch {}
					}
				},
				{ labels: ['converted', 'skipped', 'empty'] },
			);

			await expectMinFiles(tilesDir, '*.jp2', 50);
		}),
	],
);
