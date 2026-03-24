import { rmSync, statSync, writeFileSync } from 'node:fs';
import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { downloadFile, runCommand } from '../lib/command.ts';
import { extractZipFile } from '../lib/fs.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { runMosaicTile } from '../run/commands.ts';

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
	},
	init: () => generateTileIds().map((id) => ({ id })),
	download: async ({ id }, { tempDir, skipDest }) => {
		const zipPath = join(tempDir, `${id}.zip`);
		const extractDir = join(tempDir, id);
		const vrtPath = join(tempDir, `${id}.vrt`);
		const listPath = join(tempDir, `${id}_files.txt`);

		try {
			await withRetry(() => downloadFile(`${BASE_URL}dop20rgb_32_${id}_2_bw.zip`, zipPath), { maxAttempts: 3 });

			const size = statSync(zipPath).size;
			if (size < 1000) {
				writeFileSync(skipDest, '');
				return 'empty';
			}

			await extractZipFile(zipPath, extractDir);

			const tifDir = join(extractDir, `dop20rgb_32_${id}_2_bw`);
			const tifFiles = (await readdir(tifDir)).filter((f) => f.endsWith('.tif'));
			if (tifFiles.length === 0) {
				writeFileSync(skipDest, '');
				return 'empty';
			}
			await writeFile(listPath, tifFiles.map((f) => join(tifDir, f)).join('\n'));
			await runCommand(
				'gdalbuildvrt',
				[
					'-q',
					'-addalpha',
					'-allow_projection_difference',
					'-a_srs',
					'EPSG:25832',
					vrtPath,
					'-input_file_list',
					listPath,
				],
				{ cwd: tempDir },
			);

			return { vrtPath, extractDir };
		} catch {
			return 'empty';
		} finally {
			for (const p of [zipPath, listPath]) {
				try {
					rmSync(p, { force: true });
				} catch {}
			}
		}
	},
	convert: async ({ vrtPath, extractDir }, { dest }) => {
		try {
			await runMosaicTile(vrtPath, dest);
		} finally {
			try {
				rmSync(vrtPath, { force: true });
			} catch {}
			try {
				rmSync(extractDir, { recursive: true, force: true });
			} catch {}
		}
	},
	minFiles: 14000,
});
