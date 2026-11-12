import { statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	defineTileRegion,
	downloadFile,
	extractZipAndBuildVrt,
	runCommand,
	runMosaicTile,
	withRetry,
} from '../../lib/index.ts';

const BASE_URL = 'https://opengeodata.lgl-bw.de/data/dop20/';

export function generateTileIds(): string[] {
	const ids: string[] = [];
	for (let x = 387; x <= 609; x += 2) {
		for (let y = 5264; y <= 5514; y += 2) {
			ids.push(`${x}_${y}`);
		}
	}
	return ids;
}

/**
 * Downloads `url` to `dest`. Returns `false` if the server answers 404, so a missing archive
 * is not retried; any other failure is rethrown for `withRetry`.
 */
export async function downloadUnlessMissing(url: string, dest: string): Promise<boolean> {
	try {
		await downloadFile(url, dest);
		return true;
	} catch (err) {
		const status = await runCommand('curl', ['-s', '-o', '/dev/null', '-r', '0-0', '-w', '%{http_code}', url], {
			quiet: true,
		}).then(
			(probe) => new TextDecoder().decode(probe.stdout).trim(),
			() => undefined,
		);
		if (status === '404') return false;
		throw err;
	}
}

export default defineTileRegion({
	name: 'de/baden_wuerttemberg',
	meta: {
		status: 'released',
		notes: [
			'No API, such as an ATOM feed, available.',
			'Hacky solution is required: Guessing filenames since there is no official index.',
			'Images are unnecessarily packed into container files, such as ZIP.',
			'Why are 1x1km tiles grouped into 2x2km containers? And why are the offsets not a multiple of 2?',
			'License requires attribution.',
			'National license instead of an international standard.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
		entries: ['result'],
		license: {
			name: 'DL-DE->BY-2.0',
			url: 'https://www.govdata.de/dl-de/by-2-0',
			requiresAttribution: true,
		},
		creator: {
			name: 'LGL, www.lgl-bw.de',
			url: 'https://www.lgl-bw.de/Produkte/Luftbildprodukte/DOP20/',
		},
		date: '2024',
		releaseDate: '2026-03-23',
	},
	init: () => generateTileIds().map((id) => ({ id })),
	download: async ({ id }, ctx) => {
		const zipPath = ctx.tempFile(join(ctx.tempDir, `${id}.zip`));
		const url = `${BASE_URL}dop20rgb_32_${id}_2_bw.zip`;

		// Filename probing: many guessed IDs lie outside the state and have no archive.
		// The server answers those with 404 (until early 2026 with a tiny error response).
		// Persist a `.skip` marker in both cases so re-runs don't retry them forever.
		const found = await withRetry(() => downloadUnlessMissing(url, zipPath), { maxAttempts: 3 });
		if (!found || statSync(zipPath).size < 1000) {
			writeFileSync(ctx.skipDest, '');
			return 'empty';
		}

		return { zipPath, id };
	},
	convert: async ({ zipPath, id }, ctx) => {
		const extractDir = ctx.tempFile(join(ctx.tempDir, id));
		const vrtPath = ctx.tempFile(join(ctx.tempDir, `${id}.vrt`));

		const { fileCount } = await extractZipAndBuildVrt(zipPath, extractDir, vrtPath, {
			subdir: `dop20rgb_32_${id}_2_bw`,
			addAlpha: true,
			allowProjectionDifference: true,
			srs: 'EPSG:25832',
		});
		if (fileCount === 0) {
			writeFileSync(ctx.skipDest, '');
			return;
		}

		await runMosaicTile(vrtPath, ctx.dest, { maxZoom: ctx.maxZoom });
	},
	// 9,356 of the 14,112 guessed squares intersect the state; the server has no archive for the rest.
	minFiles: 8500,
});
