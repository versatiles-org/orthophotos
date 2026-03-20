import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { readFile, writeFile, readdir, rename } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { defineRegion, step } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { shuffle } from '../lib/array.ts';
import { downloadFile, runCommand } from '../lib/command.ts';
import { CONCURRENCY, concurrent } from '../lib/concurrent.ts';
import { withRetry } from '../lib/retry.ts';

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

export default defineRegion(
	'de/brandenburg',
	{
		status: 'success',
		notes: [
			'No API, such as an ATOM feed, available.',
			'Parsing HTML is required.',
			'Images are unnecessarily packed into container files, such as ZIP.',
			'Server is very slow.',
			'License requires attribution.',
			'National license instead of an international standard.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
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
	[
		step('fetch-index', async (ctx) => {
			const indexPath = join(ctx.tempDir, 'index.html');
			if (!existsSync(indexPath)) {
				console.log('  Fetching index.html...');
				await withRetry(() => downloadFile(BASE_URL, indexPath), { maxAttempts: 3 });
			}

			const html = await readFile(indexPath, 'utf-8');
			const filenames = parseZipFilenames(html);
			await writeFile(join(ctx.tempDir, 'filenames.json'), JSON.stringify(filenames));
			console.log(`  Found ${filenames.length} zip files`);
		}),

		step('download-tiles', async (ctx) => {
			const tilesDir = join(ctx.dataDir, 'tiles');
			mkdirSync(tilesDir, { recursive: true });

			const filenames: string[] = JSON.parse(await readFile(join(ctx.tempDir, 'filenames.json'), 'utf-8'));

			await concurrent(
				shuffle(filenames),
				CONCURRENCY,
				async (zipName) => {
					const id = basename(zipName, '.zip');
					if (existsSync(join(tilesDir, `${id}.jpg`))) return 'skipped';

					const zipPath = join(ctx.tempDir, `${id}.zip`);
					const extractDir = join(ctx.tempDir, id);
					try {
						await withRetry(() => downloadFile(`${BASE_URL}${zipName}`, zipPath), { maxAttempts: 3 });
						await runCommand('unzip', ['-qo', zipPath, '-d', extractDir]);

						// Move .jpg and .jgw files to tiles dir
						const files = await readdir(extractDir, { recursive: true });
						for (const file of files) {
							const name = typeof file === 'string' ? file : String(file);
							if (name.endsWith('.jpg') || name.endsWith('.jgw')) {
								await rename(join(extractDir, name), join(tilesDir, basename(name)));
							}
						}
						return 'downloaded';
					} finally {
						try {
							rmSync(zipPath, { force: true });
						} catch {}
						try {
							rmSync(extractDir, { recursive: true, force: true });
						} catch {}
					}
				},
				{ labels: ['downloaded', 'skipped'] },
			);

			await expectMinFiles(tilesDir, '*.jpg', 50);
		}),
	],
);
