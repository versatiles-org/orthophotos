import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { downloadFile, runCommand } from '../lib/command.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { runVersatilesRasterConvert } from '../run/commands.ts';

const BASE_URL = 'https://gdi2.geo.bremen.de/inspire/download/DOP/data/';
const IMAGE_EXTS = ['.jpg', '.tif', '.jp2'];
const DISTRICTS = [
	{ name: 'hb', zip: 'DOP10_RGB_JPG_HB.zip' },
	{ name: 'bhv', zip: 'DOP10_RGB_JPG_BHV.zip' },
];

async function findFile(dir: string, ext: string): Promise<string | undefined> {
	const entries = await readdir(dir);
	return entries.find((e) => e.endsWith(ext));
}

export default defineTileRegion({
	name: 'de/bremen',
	meta: {
		status: 'success',
		notes: [
			'No API, such as an ATOM feed, available.',
			'Images are unnecessarily packed into container files, such as ZIP.',
			'License requires attribution.',
			'JPEGs with World files are provided, but not more convenient GeoTIFFs/JPEG2000.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
		entries: ['result'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'Landesamt GeoInformation Bremen',
			url: 'https://metaver.de/trefferanzeige?cmd=doShowDocument&docuuid=910260F7-AC66-40F3-8BA2-E7108C3C71C9',
		},
		date: '2025',
	},
	init: async (ctx) => {
		const items: { id: string; srcPath: string }[] = [];

		for (const district of DISTRICTS) {
			const extractDir = join(ctx.tempDir, district.name);

			if (!existsSync(extractDir)) {
				const outerZip = join(ctx.tempDir, district.zip);
				console.log(`  Downloading ${district.zip}...`);
				await withRetry(() => downloadFile(`${BASE_URL}${district.zip}`, outerZip), { maxAttempts: 3 });

				console.log(`  Extracting ${district.zip}...`);
				await runCommand('unzip', ['-qo', outerZip, '-d', extractDir]);

				// Find and extract the inner zip (name includes a date suffix that changes)
				const innerZip = await findFile(extractDir, '.zip');
				if (innerZip) {
					console.log(`  Extracting inner ${innerZip}...`);
					await runCommand('unzip', ['-qo', join(extractDir, innerZip), '-d', extractDir]);
				}
			}

			// Collect all image files, prefixed with district name to avoid collisions
			const files = await readdir(extractDir, { recursive: true });
			for (const file of files) {
				const name = typeof file === 'string' ? file : String(file);
				if (!IMAGE_EXTS.some((ext) => name.endsWith(ext))) continue;
				const base = basename(name, basename(name).slice(basename(name).lastIndexOf('.')));
				items.push({ id: `${district.name}_${base}`, srcPath: join(extractDir, name) });
			}
		}

		return items;
	},
	download: async ({ srcPath }) => {
		return { src: srcPath };
	},
	convert: async ({ src }, { dest }) => {
		await runVersatilesRasterConvert(src, dest);
	},
	minFiles: 123456,
});
