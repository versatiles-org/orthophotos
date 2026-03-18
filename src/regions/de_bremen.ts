import { mkdirSync } from 'node:fs';
import { readdir, rename } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { defineRegion, step } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { downloadFile, runCommand } from '../lib/command.ts';
import { withRetry } from '../lib/retry.ts';

const BASE_URL = 'https://gdi2.geo.bremen.de/inspire/download/DOP/data/';
const DISTRICTS = [
	{ name: 'hb', zip: 'DOP10_RGB_JPG_HB.zip', tilesDir: 'tiles_hb', format: 'jpg' },
	{ name: 'bhv', zip: 'DOP10_RGB_JPG_BHV.zip', tilesDir: 'tiles_bhv', format: 'tif' },
] as const;

async function findFile(dir: string, ext: string): Promise<string | undefined> {
	const entries = await readdir(dir);
	return entries.find((e) => e.endsWith(ext));
}

async function moveFiles(srcDir: string, destDir: string, ext: string, renameExt?: string): Promise<number> {
	let count = 0;
	const entries = await readdir(srcDir, { recursive: true });
	for (const entry of entries) {
		const name = typeof entry === 'string' ? entry : String(entry);
		if (!name.endsWith(ext)) continue;
		const destName = renameExt ? basename(name, ext) + renameExt : basename(name);
		await rename(join(srcDir, name), join(destDir, destName));
		count++;
	}
	return count;
}

export default defineRegion(
	'de/bremen',
	{
		status: 'success',
		notes: [
			'No API, such as an ATOM feed, available.',
			'Images are unnecessarily packed into container files, such as ZIP.',
			'License requires attribution.',
			'JPEGs with World files are provided, but not more convenient GeoTIFFs/JPEG2000.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
		entries: ['tiles_hb', 'tiles_bhv'],
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
	[
		step('download-zips', async (ctx) => {
			for (const district of DISTRICTS) {
				const dest = join(ctx.tempDir, district.zip);
				console.log(`  Downloading ${district.zip}...`);
				await withRetry(() => downloadFile(`${BASE_URL}${district.zip}`, dest), { maxAttempts: 3 });
			}
		}),

		step('extract', async (ctx) => {
			for (const district of DISTRICTS) {
				const outerZip = join(ctx.tempDir, district.zip);
				const extractDir = join(ctx.tempDir, district.name);

				console.log(`  Extracting ${district.zip}...`);
				await runCommand('unzip', ['-qo', outerZip, '-d', extractDir]);

				// Find and extract the inner zip (name includes a date suffix that changes)
				const innerZip = await findFile(extractDir, '.zip');
				if (innerZip) {
					console.log(`  Extracting inner ${innerZip}...`);
					await runCommand('unzip', ['-qo', join(extractDir, innerZip), '-d', extractDir]);
				}
			}
		}),

		step('move-tiles', async (ctx) => {
			for (const district of DISTRICTS) {
				const tilesDir = join(ctx.dataDir, district.tilesDir);
				mkdirSync(tilesDir, { recursive: true });

				const extractDir = join(ctx.tempDir, district.name);

				if (district.format === 'jpg') {
					const jpgCount = await moveFiles(extractDir, tilesDir, '.jpg');
					const wldCount = await moveFiles(extractDir, tilesDir, '.wld', '.jgw');
					console.log(`  ${district.name}: moved ${jpgCount} .jpg + ${wldCount} .wld→.jgw`);
				} else {
					const tifCount = await moveFiles(extractDir, tilesDir, '.tif');
					console.log(`  ${district.name}: moved ${tifCount} .tif`);
				}
			}

			await expectMinFiles(join(ctx.dataDir, 'tiles_hb'), '*.jpg', 10);
			await expectMinFiles(join(ctx.dataDir, 'tiles_bhv'), '*.tif', 10);
		}),
	],
);
