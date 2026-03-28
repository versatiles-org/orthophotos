import { mkdirSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { safeRm, extractZipFile } from '../lib/fs.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { pipeline } from '../lib/pipeline.ts';
import { RemoteZip } from '../lib/remote-zip.ts';
import { runMosaicAssemble, runMosaicTile } from '../run/commands.ts';

const BASE_URL = 'https://gdi2.geo.bremen.de/inspire/download/DOP/data/';
const IMAGE_EXTS = ['.jpg', '.tif', '.jp2'];
const DISTRICTS = [
	{ name: 'hb', zip: 'DOP10_RGB_JPG_HB.zip' },
	{ name: 'bhv', zip: 'DOP10_RGB_JPG_BHV.zip' },
];

export default defineTileRegion({
	name: 'de/bremen',
	meta: {
		status: 'released',
		notes: [
			'No API, such as an ATOM feed, available.',
			'Images are unnecessarily packed into container files, such as ZIP.',
			'License requires attribution.',
			'JPEGs with World files are provided, but not more convenient GeoTIFFs/JPEG2000.',
			'Nested ZIP archives (outer ZIP contains inner ZIP with date suffix).',
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
		releaseDate: '2026-03-24',
	},
	init: async () => {
		return DISTRICTS.map((d) => ({
			id: d.name,
			outerZipUrl: `${BASE_URL}${d.zip}`,
		}));
	},
	downloadLimit: 1,
	download: async ({ outerZipUrl, id }, { tempDir }) => {
		// Stream the inner ZIP out of the outer ZIP via RemoteZip
		console.log(`  Reading ${id}...`);
		const outerZip = await RemoteZip.open(outerZipUrl);
		const innerEntry = outerZip.getEntries().find((e) => e.filename.endsWith('.zip'));
		if (!innerEntry) throw new Error(`No inner ZIP found in ${outerZipUrl}`);

		const innerZipPath = join(tempDir, `${id}_inner.zip`);
		console.log(`  Downloading inner ZIP (~${(innerEntry.uncompressedSize / 1e9).toFixed(1)} GB)...`);
		await outerZip.extractToFile(innerEntry, innerZipPath);

		return { innerZipPath };
	},
	convertLimit: { concurrency: 1 },
	convert: async ({ innerZipPath }, { dest, tempDir }) => {
		const extractDir = join(tempDir, `extract_${Date.now()}`);
		const tilesDir = join(tempDir, `tiles_${Date.now()}`);
		try {
			console.log(`  Extracting ${basename(innerZipPath)}...`);
			await extractZipFile(innerZipPath, extractDir);
			safeRm(innerZipPath);

			const files = await readdir(extractDir, { recursive: true });
			const imageFiles = files
				.map((f) => (typeof f === 'string' ? f : String(f)))
				.filter((f) => IMAGE_EXTS.some((ext) => f.endsWith(ext)))
				.map((f) => join(extractDir, f));

			if (imageFiles.length === 0) throw new Error(`No image files found in ${extractDir}`);

			mkdirSync(tilesDir, { recursive: true });
			console.log(`  Converting ${imageFiles.length} image files...`);
			const versatilesFiles: string[] = [];
			await pipeline(imageFiles, { progress: { labels: ['converted'] } }).forEach(4, async (imgPath) => {
				const tileName = basename(imgPath).replace(/\.[^.]+$/, '.versatiles');
				const tilePath = join(tilesDir, tileName);
				await runMosaicTile(imgPath, tilePath, { crs: '25832', nodata: '0,0,0' });
				versatilesFiles.push(tilePath);
				return 'converted';
			});

			const filelistPath = join(tempDir, 'filelist.txt');
			writeFileSync(filelistPath, versatilesFiles.join('\n'));
			await runMosaicAssemble(filelistPath, dest, { lossless: true });
			safeRm(filelistPath);
		} finally {
			safeRm(innerZipPath);
			safeRm(extractDir);
			safeRm(tilesDir);
		}
	},
	minFiles: 2,
});
