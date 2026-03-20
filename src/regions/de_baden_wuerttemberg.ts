import { existsSync, mkdirSync, rmSync, statSync, renameSync, writeFileSync } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineRegion, step } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { downloadFile, runCommand } from '../lib/command.ts';
import { shuffle } from '../lib/array.ts';
import { CONCURRENCY, concurrent } from '../lib/concurrent.ts';
import { withRetry } from '../lib/retry.ts';

const BASE_URL = 'https://opengeodata.lgl-bw.de/data/dop20/';

export function generateTileIds(): string[] {
	const ids: string[] = [];
	for (let x = 387; x <= 609; x += 2) {
		for (let y = 5264; y <= 5514; y += 2) {
			ids.push(`${x}_${y}`);
		}
	}
	return ids;
}

export default defineRegion(
	'de/baden_wuerttemberg',
	{
		status: 'success',
		notes: [
			'No API, such as an ATOM feed, available.',
			'Hacky solution is required: Guessing filenames since there is no official index.',
			'Images are unnecessarily packed into container files, such as ZIP.',
			'Why are 1x1km tiles grouped into 2x2km containers? And why are the offsets not a multiple of 2?',
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
			name: 'LGL, www.lgl-bw.de',
			url: 'https://www.lgl-bw.de/Produkte/Luftbildprodukte/DOP20/',
		},
		date: '2024',
	},
	[
		step('download-tiles', async (ctx) => {
			const tilesDir = join(ctx.dataDir, 'tiles');
			mkdirSync(tilesDir, { recursive: true });

			const ids = shuffle(generateTileIds());

			await concurrent(
				ids,
				CONCURRENCY,
				async (id) => {
					const destJp2 = join(tilesDir, `${id}.jp2`);
					const skipFile = join(tilesDir, `${id}.skip`);
					if (existsSync(destJp2) || existsSync(skipFile)) return 'skipped';

					const zipPath = join(ctx.tempDir, `${id}.zip`);
					const extractDir = join(ctx.tempDir, id);
					const vrtPath = join(ctx.tempDir, `${id}.vrt`);
					const jp2Path = join(ctx.tempDir, `${id}.jp2`);
					const listPath = join(ctx.tempDir, `${id}_files.txt`);

					try {
						await withRetry(() => downloadFile(`${BASE_URL}dop20rgb_32_${id}_2_bw.zip`, zipPath), { maxAttempts: 3 });

						const size = statSync(zipPath).size;
						if (size < 1000) {
							writeFileSync(skipFile, '');
							return 'empty';
						}

						await runCommand('unzip', ['-qo', zipPath, '-d', extractDir]);

						const tifDir = join(extractDir, `dop20rgb_32_${id}_2_bw`);
						const tifFiles = (await readdir(tifDir)).filter((f) => f.endsWith('.tif'));
						if (tifFiles.length === 0) {
							writeFileSync(skipFile, '');
							return 'empty';
						}
						await writeFile(listPath, tifFiles.map((f) => join(tifDir, f)).join('\n'));
						await runCommand(
							'gdalbuildvrt',
							[
								'-q',
								'-addalpha',
								'-allow_projection_difference',
								'-a_srs',
								'EPSG:25832',
								vrtPath,
								'-input_file_list',
								listPath,
							],
							{ cwd: ctx.tempDir },
						);

						await runCommand('gdal_translate', ['-q', vrtPath, jp2Path]);
						renameSync(jp2Path, destJp2);
						return 'converted';
					} catch {
						return 'empty';
					} finally {
						for (const p of [zipPath, vrtPath, jp2Path, listPath]) {
							try {
								rmSync(p, { force: true });
							} catch {}
						}
						try {
							rmSync(extractDir, { recursive: true, force: true });
						} catch {}
					}
				},
				{ labels: ['converted', 'skipped', 'empty'] },
			);

			await expectMinFiles(tilesDir, '*.jp2', 50);
		}),
	],
);
