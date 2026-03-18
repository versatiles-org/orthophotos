import { existsSync, mkdirSync, rmSync, renameSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineRegion, step } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { shuffle } from '../lib/array.ts';
import { downloadFile, runCommand } from '../lib/command.ts';
import { concurrent } from '../lib/concurrent.ts';
import { withRetry } from '../lib/retry.ts';

const INDEX_URL = 'https://www.opengeodata.nrw.de/produkte/geobasis/lusat/akt/dop/dop_jp2_f10/';
const CONCURRENCY = 16;

export function parseFilenames(html: string): string[] {
	const pattern = /file name="(dop[^"]*\.jp2)"/g;
	const filenames: string[] = [];
	let match;
	while ((match = pattern.exec(html)) !== null) {
		filenames.push(match[1]);
	}
	return filenames;
}

export default defineRegion(
	'de/nordrhein_westfalen',
	{
		status: 'success',
		notes: [
			'National license instead of an international standard.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
		entries: ['tiles'],
		license: {
			name: 'DL-DE->Zero-2.0',
			url: 'https://www.govdata.de/dl-de/zero-2-0',
			requiresAttribution: false,
		},
		creator: {
			name: 'Geobasis NRW',
			url: 'https://www.opengeodata.nrw.de/produkte/geobasis/lusat/akt/dop/dop_jp2_f10/',
		},
		date: '2024',
		vrt: { defaults: { bands: [1, 2, 3] } },
	},
	[
		step('fetch-index', async (ctx) => {
			const indexPath = join(ctx.tempDir, 'index.xml');
			if (!existsSync(indexPath)) {
				console.log('  Fetching index...');
				await withRetry(() => downloadFile(INDEX_URL, indexPath), { maxAttempts: 3 });
			}

			const html = await readFile(indexPath, 'utf-8');
			const filenames = parseFilenames(html);
			await writeFile(join(ctx.tempDir, 'filenames.json'), JSON.stringify(filenames));
			console.log(`  Found ${filenames.length} tiles`);
		}),

		step('download-tiles', async (ctx) => {
			const tilesDir = join(ctx.dataDir, 'tiles');
			mkdirSync(tilesDir, { recursive: true });

			const filenames: string[] = JSON.parse(await readFile(join(ctx.tempDir, 'filenames.json'), 'utf-8'));

			await concurrent(
				shuffle(filenames),
				CONCURRENCY,
				async (filename) => {
					const dest = join(tilesDir, filename);
					if (existsSync(dest)) return 'skipped';

					const tmpPath = join(ctx.tempDir, filename);
					const tmpResized = join(ctx.tempDir, `${filename}.tmp.jp2`);
					try {
						await withRetry(() => downloadFile(`${INDEX_URL}${filename}`, tmpPath), { maxAttempts: 3 });
						await runCommand('gdal_translate', ['-q', '-outsize', '50%', '50%', tmpPath, tmpResized]);
						renameSync(tmpResized, dest);
						return 'converted';
					} finally {
						for (const p of [tmpPath, tmpResized]) {
							try {
								rmSync(p, { force: true });
							} catch {}
						}
					}
				},
				{ labels: ['converted', 'skipped'] },
			);

			await expectMinFiles(tilesDir, '*.jp2', 50);
		}),
	],
);
