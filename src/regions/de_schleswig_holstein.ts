import { existsSync, renameSync, rmSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runCommand } from '../lib/command.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { isValidRaster } from '../lib/validators.ts';
import { runMosaicTile } from '../run/commands.ts';

const GEOJSON_URL =
	'https://geodaten.schleswig-holstein.de/gaialight-sh/_apps/dladownload/single.php?file=DOP20_SH__Massendownload.geojson&id=4';

interface TileProperties {
	kachel: string;
	link_data: string;
}

interface GeoJsonResponse {
	features: { properties: TileProperties }[];
}

/**
 * Downloads a file using curl with --insecure flag (needed for geodaten.schleswig-holstein.de).
 */
async function downloadInsecure(url: string, dest: string): Promise<void> {
	const tmp = `${dest}.tmp`;
	await runCommand('curl', ['-sko', tmp, url]);
	renameSync(tmp, dest);
}

export function parseGeoJson(data: GeoJsonResponse): { id: string; url: string }[] {
	return data.features.map((f) => ({
		id: f.properties.kachel,
		url: f.properties.link_data,
	}));
}

export default defineTileRegion({
	name: 'de/schleswig_holstein',
	meta: {
		status: 'success',
		notes: [
			'License requires attribution.',
			'Server has an invalid SSL certificate.',
			'Server returns 1-byte files for some tiles.',
			'Some tiles may be missing or incomplete.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
		entries: ['result'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'GeoBasis-DE/LVermGeo SH',
			url: 'https://opendata.schleswig-holstein.de/dataset/digitale-orthophotos-dop20',
		},
		date: '2024',
	},
	init: async (ctx) => {
		const geojsonPath = join(ctx.tempDir, 'tiles.geojson');
		if (!existsSync(geojsonPath)) {
			console.log('  Fetching tile index...');
			await withRetry(() => downloadInsecure(GEOJSON_URL, geojsonPath), { maxAttempts: 3 });
		}
		const content = await readFile(geojsonPath, 'utf-8');
		return parseGeoJson(JSON.parse(content));
	},
	download: async ({ url, id }, { tempDir, errors }) => {
		const tifPath = join(tempDir, `${id}.tif`);
		try {
			await withRetry(() => downloadInsecure(url, tifPath), { maxAttempts: 3 });
			if (statSync(tifPath).size === 1) {
				return 'empty'; // server returns 1-byte files ???
			}
			if (!(await isValidRaster(tifPath))) {
				errors.add(`${id}.tif (${url})`);
				return 'invalid';
			}
			return { tifPath };
		} catch (err) {
			try {
				rmSync(tifPath, { force: true });
			} catch {}
			throw err;
		}
	},
	convert: async ({ tifPath }, { dest }) => {
		try {
			await runMosaicTile(tifPath, dest);
		} finally {
			try {
				rmSync(tifPath, { force: true });
			} catch {}
		}
	},
	minFiles: 17000,
});
