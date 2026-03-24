import { rmSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { downloadFile, runCommand } from '../lib/command.ts';
import { extractZipFile, safeRemoveDir } from '../lib/fs.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { runVersatilesRasterConvert } from '../run/commands.ts';

const BASE_URL = 'https://gdi2.geo.bremen.de/inspire/download/DOP/data/';
const IMAGE_EXTS = ['.jpg', '.tif', '.jp2'];
const DISTRICTS = [
	{ name: 'hb', zip: 'DOP10_RGB_JPG_HB.zip' },
	{ name: 'bhv', zip: 'DOP10_RGB_JPG_BHV.zip' },
];

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
	init: async () => {
		return DISTRICTS.map((d) => ({
			id: d.name,
			url: `${BASE_URL}${d.zip}`,
		}));
	},
	download: async ({ url, id }, { tempDir }) => {
		const zipPath = join(tempDir, `${id}.zip`);
		console.log(`  Downloading ${id}.zip...`);
		await withRetry(() => downloadFile(url, zipPath), { maxAttempts: 3 });
		return { zipPath };
	},
	convertCores: 8,
	convert: async ({ zipPath }, { dest, tempDir }) => {
		const extractDir = join(tempDir, `extract_${Date.now()}`);
		const vrtPath = `${dest}.vrt`;
		try {
			console.log(`  Extracting ${zipPath}...`);
			await extractZipFile(zipPath, extractDir);

			// Find and extract the inner zip (name includes a date suffix that changes)
			const outerFiles = await readdir(extractDir);
			const innerZip = outerFiles.find((f) => f.endsWith('.zip'));
			if (innerZip) {
				console.log(`  Extracting inner ${innerZip}...`);
				await runCommand('unzip', ['-qo', join(extractDir, innerZip), '-d', extractDir]);
				rmSync(join(extractDir, innerZip), { force: true });
			}

			// Find all image files
			const files = await readdir(extractDir, { recursive: true });
			const imageFiles = files
				.map((f) => (typeof f === 'string' ? f : String(f)))
				.filter((f) => IMAGE_EXTS.some((ext) => f.endsWith(ext)))
				.map((f) => join(extractDir, f));

			if (imageFiles.length === 0) {
				throw new Error(`No image files found in ${extractDir}`);
			}

			// Build VRT from all images
			await runCommand('gdalbuildvrt', [vrtPath, ...imageFiles]);

			// Convert VRT to versatiles
			await runVersatilesRasterConvert(vrtPath, dest);
		} finally {
			try {
				rmSync(vrtPath, { force: true });
				rmSync(zipPath, { force: true });
			} catch {}
			await safeRemoveDir(extractDir);
		}
	},
	minFiles: 2,
});
