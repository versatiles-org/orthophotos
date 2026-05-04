import { mkdirSync, writeFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import { basename, join } from 'node:path';
import { defineTileRegion, extractZipFile, pipeline, RemoteZip, runMosaicAssemble, runMosaicTile } from '../lib.ts';

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
		releaseDate: '2026-03-28',
	},
	init: async () => {
		return DISTRICTS.map((d) => ({
			id: d.name,
			outerZipUrl: `${BASE_URL}${d.zip}`,
		}));
	},
	downloadLimit: 1,
	download: async ({ outerZipUrl, id }, ctx) => {
		// Stream the inner ZIP out of the outer ZIP via RemoteZip
		console.log(`  Reading ${id}...`);
		const outerZip = await RemoteZip.open(outerZipUrl);
		const innerEntry = outerZip.getEntries().find((e) => e.filename.endsWith('.zip'));
		if (!innerEntry) throw new Error(`No inner ZIP found in ${outerZipUrl}`);

		const innerZipPath = ctx.tempFile(join(ctx.tempDir, `${id}_inner.zip`));
		console.log(`  Downloading inner ZIP (~${(innerEntry.uncompressedSize / 1e9).toFixed(1)} GB)...`);
		await outerZip.extractToFile(innerEntry, innerZipPath);

		return { innerZipPath };
	},
	convertLimit: { concurrency: 1 },
	convert: async ({ innerZipPath }, ctx) => {
		const extractDir = ctx.tempFile(join(ctx.tempDir, `extract_${Date.now()}`));
		const tilesDir = ctx.tempFile(join(ctx.tempDir, `tiles_${Date.now()}`));
		const filelistPath = ctx.tempFile(join(ctx.tempDir, 'filelist.txt'));

		console.log(`  Extracting ${basename(innerZipPath)}...`);
		await extractZipFile(innerZipPath, extractDir);

		const files = await readdir(extractDir, { recursive: true });
		const imageFiles = files
			.map((f) => (typeof f === 'string' ? f : String(f)))
			.filter((f) => IMAGE_EXTS.some((ext) => f.endsWith(ext)))
			.map((f) => join(extractDir, f));

		if (imageFiles.length === 0) throw new Error(`No image files found in ${extractDir}`);

		mkdirSync(tilesDir, { recursive: true });
		console.log(`  Converting ${imageFiles.length} image files...`);
		const versatilesFiles: string[] = [];
		// Each runMosaicTile spawns parallel GDAL readers; cap at half the host cores.
		const innerConcurrency = Math.max(1, Math.floor(availableParallelism() / 2));
		await pipeline(imageFiles, { progress: { labels: ['converted'] } }).forEach(innerConcurrency, async (imgPath) => {
			const tileName = basename(imgPath).replace(/\.[^.]+$/, '.versatiles');
			const tilePath = join(tilesDir, tileName);
			await runMosaicTile(imgPath, tilePath, { crs: '25832', nodata: '0,0,0' });
			versatilesFiles.push(tilePath);
			return 'converted';
		});

		writeFileSync(filelistPath, versatilesFiles.join('\n'));
		// Source archives bundle a whole district's worth of orthophoto tiles into a single
		// ZIP — splitting one item into many would force gigabytes of network re-fetches per
		// tile. The plan documents this as an accepted exception to one-item-per-versatiles.
		await runMosaicAssemble(filelistPath, ctx.dest, { lossless: true });
	},
	minFiles: 2,
});
