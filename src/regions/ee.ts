import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineTileRegion, downloadFile, extractZipFile, runCommand, runMosaicTile, withRetry } from './lib.ts';

const INDEX_URL = 'https://geoportaal.maaamet.ee/docs/Avaandmed/epk10_eng.zip';
const API_URL = 'https://geoportaal.maaamet.ee/index.php?lang_id=2&plugin_act=otsing&page_id=662';
const DL_BASE = 'https://geoportaal.maaamet.ee/index.php?lang_id=2&plugin_act=otsing&page_id=662&dl=1';

/** Query the download API for the latest RGB GeoTIFF filename for a sheet. */
async function getLatestFilename(nr: number): Promise<string | null> {
	const url = `${API_URL}&kaardiruut=${nr}&andmetyyp=ortofoto_eesti_rgb`;
	const result = await runCommand('curl', ['-s', '--max-time', '15', url], { quiet: true });
	const html = new TextDecoder().decode(result.stdout);
	const match = html.match(/f=(\d+_OF_RGB_GeoTIFF_[^&"]+\.zip)/);
	return match ? match[1] : null;
}

/** Extract sheet numbers from the shapefile index via ogr2ogr. */
async function loadSheetNumbers(shpDir: string): Promise<number[]> {
	const shpFile = readdirSync(shpDir).find((f) => f.endsWith('.shp'));
	if (!shpFile) throw new Error('No .shp file found in index');
	const geojsonPath = join(shpDir, 'index.geojson');
	if (!existsSync(geojsonPath)) {
		await runCommand('ogr2ogr', ['-f', 'GeoJSON', geojsonPath, join(shpDir, shpFile)], { quiet: true });
	}
	const data = JSON.parse(await readFile(geojsonPath, 'utf-8')) as {
		features: { properties: { NR: number } }[];
	};
	return data.features.map((f) => f.properties.NR).filter((nr) => nr >= 44744 && nr <= 74331);
}

interface EeItem {
	id: string;
	nr: number;
}

interface EeDownload {
	zipPath: string;
	nr: number;
}

export default defineTileRegion<EeItem, EeDownload>({
	name: 'ee',
	meta: {
		status: 'scraping',
		notes: ['Direct GeoTIFF download per map sheet.', 'License requires attribution.'],
		entries: ['result'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://geoportaal.maaruum.ee/avaandmete-litsents',
			requiresAttribution: true,
		},
		creator: {
			name: 'Maa- ja Ruumiamet (Estonian Land and Spatial Development Board)',
			url: 'https://geoportaal.maaamet.ee/eng/spatial-data/orthophotos-p309.html',
		},
		date: '2024',
		mask: true,
	},
	init: async (ctx) => {
		// Download and extract map sheet index
		const indexZipPath = join(ctx.tempDir, 'epk10_eng.zip');
		const indexDir = join(ctx.tempDir, 'epk10');
		if (!existsSync(indexDir)) {
			if (!existsSync(indexZipPath)) {
				console.log('  Downloading map sheet index...');
				await downloadFile(INDEX_URL, indexZipPath);
			}
			await extractZipFile(indexZipPath, indexDir);
		}

		const sheetNumbers = await loadSheetNumbers(indexDir);
		console.log(`  ${sheetNumbers.length} map sheets in valid range`);

		return sheetNumbers.map((nr) => ({ id: String(nr), nr }));
	},
	downloadLimit: 2,
	download: async (item, ctx) => {
		const filename = await getLatestFilename(item.nr);
		if (!filename) {
			// Persist a `.skip` marker — the API result for this sheet won't change between runs.
			writeFileSync(ctx.skipDest, '');
			return 'empty';
		}

		const zipPath = ctx.tempFile(join(ctx.tempDir, `${item.id}.zip`));
		const url = `${DL_BASE}&kaardiruut=${item.nr}&andmetyyp=ortofoto_eesti_rgb&f=${filename}`;

		await withRetry(() => downloadFile(url, zipPath), { maxAttempts: 3 });

		return { zipPath, nr: item.nr };
	},
	convert: async (data, ctx) => {
		const extractDir = ctx.tempFile(join(ctx.tempDir, `${data.nr}_extract`));
		await extractZipFile(data.zipPath, extractDir);

		// Find the .tif file in the extracted directory
		const tifFile = readdirSync(extractDir).find((f) => f.endsWith('.tif'));
		if (!tifFile) throw new Error(`No .tif found in ZIP for sheet ${data.nr}`);
		const tifPath = join(extractDir, tifFile);

		await runMosaicTile(tifPath, ctx.dest, { crs: '3301' });
	},
	minFiles: 2000,
});
