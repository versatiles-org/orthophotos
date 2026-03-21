import { existsSync, rmSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { downloadFile, runCommand } from '../lib/command.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { runVersatilesRasterConvert } from '../run/commands.ts';

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

export default defineTileRegion({
	name: 'de/hamburg',
	meta: {
		status: 'success',
		notes: [
			'No API, such as an ATOM feed, available.',
			'Images are unnecessarily packed into container files, such as ZIP.',
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
			name: 'Freie und Hansestadt Hamburg, Landesbetrieb Geoinformation und Vermessung (LGV)',
			url: 'https://metaver.de/trefferanzeige?docuuid=5DF0990B-9195-41E7-9960-9214BC85B4DA',
		},
		date: '2024',
	},
	init: async (ctx) => {
		const items: { id: string; tifPath: string }[] = [];

		for (const zipName of ZIP_FILES) {
			const id = basename(zipName, '.zip');
			const extractDir = join(ctx.tempDir, id);

			if (!existsSync(extractDir)) {
				const zipPath = join(ctx.tempDir, zipName);
				console.log(`  Downloading ${zipName}...`);
				await withRetry(() => downloadFile(`${BASE_URL}${zipName}`, zipPath), { maxAttempts: 3 });
				await runCommand('unzip', ['-qo', zipPath, '-d', extractDir]);
				rmSync(zipPath, { force: true });
			}

			const files = await readdir(extractDir, { recursive: true });
			for (const file of files) {
				const name = typeof file === 'string' ? file : String(file);
				if (!name.endsWith('.tif')) continue;
				items.push({ id: basename(name, '.tif'), tifPath: join(extractDir, name) });
			}
		}

		return items;
	},
	downloadConcurrency: 2,
	download: async ({ tifPath }, { dest }) => {
		await runVersatilesRasterConvert(tifPath, dest);
	},
	minFiles: 10,
});
