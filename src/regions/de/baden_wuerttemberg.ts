import { statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
	defineTileRegion,
	downloadFile,
	extractZipAndBuildVrt,
	runMosaicTile,
	withRetry,
} from '../../lib/region-api.ts';

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
		await withRetry(() => downloadFile(`${BASE_URL}dop20rgb_32_${id}_2_bw.zip`, zipPath), { maxAttempts: 3 });

		// Filename probing: many guessed IDs don't correspond to a real archive.
		// The server returns a tiny error response in those cases — persist a `.skip`
		// marker so re-runs don't retry these forever.
		if (statSync(zipPath).size < 1000) {
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

		await runMosaicTile(vrtPath, ctx.dest);
	},
	minFiles: 14000,
});
