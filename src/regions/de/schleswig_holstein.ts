import { existsSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineTileRegion, isValidRaster, runCommand, runMosaicTile, withRetry } from '../../lib/index.ts';

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
 *
 * Uses `--fail` so HTTP 4xx/5xx responses propagate as errors rather than silently
 * writing the error body to disk — otherwise a 1-byte error response would be
 * indistinguishable from the server's known "1-byte tile" quirk.
 */
async function downloadInsecure(url: string, dest: string): Promise<void> {
	const tmp = `${dest}.tmp`;
	await runCommand('curl', ['-skfo', tmp, url]);
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
		status: 'released',
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
		releaseDate: '2026-03-24',
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
	download: async ({ url, id }, ctx) => {
		const tifPath = ctx.tempFile(join(ctx.tempDir, `${id}.tif`));

		await withRetry(() => downloadInsecure(url, tifPath), { maxAttempts: 3 });
		// Known data-source quirk: a small subset of tiles in the index return a
		// 1-byte HTTP 200 body (the index lists tiles that don't actually exist).
		// `--fail` already rules out HTTP errors, so reaching this branch means
		// the server really does have nothing for this tile — write `.skip` so
		// re-runs don't refetch.
		if (statSync(tifPath).size === 1) {
			writeFileSync(ctx.skipDest, '');
			return 'empty';
		}
		if (!(await isValidRaster(tifPath))) {
			ctx.errors.add(`${id}.tif (${url})`);
			return 'invalid';
		}
		return { tifPath };
	},
	convert: async ({ tifPath }, { dest }) => {
		await runMosaicTile(tifPath, dest);
	},
	minFiles: 17000,
});
