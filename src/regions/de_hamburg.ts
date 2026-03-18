import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { defineRegion, step } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { downloadFile, runCommand } from '../lib/command.ts';
import { concurrent } from '../lib/concurrent.ts';
import { withRetry } from '../lib/retry.ts';

const BASE_URL = 'https://daten-hamburg.de/geographie_geologie_geobasisdaten/digitale_orthophotos/DOP_belaubt/';
const ZIP_FILES = [
	'DOP2024_belaubt_Hamburg_Altona.zip',
	'DOP2024_belaubt_Hamburg_Bergedorf.zip',
	'DOP2024_belaubt_Hamburg_Eimsbuettel.zip',
	'DOP2024_belaubt_Hamburg_Hamburg-Mitte.zip',
	'DOP2024_belaubt_Hamburg_Hamburg-Nord.zip',
	'DOP2024_belaubt_Hamburg_Harburg.zip',
	'DOP2024_belaubt_Hamburg_Wandsbek.zip',
];

export default defineRegion(
	'de/hamburg',
	{
		status: 'success',
		notes: [
			'No API, such as an ATOM feed, available.',
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
			name: 'Freie und Hansestadt Hamburg, Landesbetrieb Geoinformation und Vermessung (LGV)',
			url: 'https://metaver.de/trefferanzeige?docuuid=5DF0990B-9195-41E7-9960-9214BC85B4DA',
		},
		date: '2024',
		vrt: {
			defaults: { ext: 'tif', bands: [1, 2, 3] },
			postProcess: async (_ctx, _entry, vrtPath) => {
				const content = await readFile(vrtPath, 'utf-8');
				const patched = content.replace(/<\/ScaleRatio>/g, '</ScaleRatio>\n      <UseMaskBand>true</UseMaskBand>');
				await writeFile(vrtPath, patched);
			},
		},
	},
	[
		step('download-zips', async (ctx) => {
			const tilesDir = join(ctx.dataDir, 'tiles');
			mkdirSync(tilesDir, { recursive: true });

			await concurrent(
				ZIP_FILES,
				2,
				async (zipName) => {
					const id = basename(zipName, '.zip');
					const zipPath = join(ctx.tempDir, zipName);
					const extractDir = join(ctx.tempDir, id);

					// Skip if we already have .tif files from this zip
					if (existsSync(extractDir)) return 'skipped';

					await withRetry(() => downloadFile(`${BASE_URL}${zipName}`, zipPath), { maxAttempts: 3 });
					await runCommand('unzip', ['-qo', zipPath, '-d', extractDir]);
					rmSync(zipPath, { force: true });

					// Move .tif files to tiles dir
					const files = await readdir(extractDir, { recursive: true });
					let count = 0;
					for (const file of files) {
						const name = typeof file === 'string' ? file : String(file);
						if (!name.endsWith('.tif')) continue;
						await rename(join(extractDir, name), join(tilesDir, basename(name)));
						count++;
					}

					rmSync(extractDir, { recursive: true, force: true });
					return 'downloaded';
				},
				{ labels: ['downloaded', 'skipped'] },
			);

			await expectMinFiles(tilesDir, '*.tif', 10);
		}),
	],
);
