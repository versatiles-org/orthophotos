import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { defineRegion, step } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { shuffle } from '../lib/array.ts';
import { downloadFile, runCommand } from '../lib/command.ts';
import { CONCURRENCY, concurrent } from '../lib/concurrent.ts';
import { withRetry } from '../lib/retry.ts';
import { runVersatilesRasterConvert } from '../run/commands.ts';

export function generateCoords(): { x: number; y: number; id: string }[] {
	const coords: { x: number; y: number; id: string }[] = [];
	for (let x = 557; x < 769; x++) {
		for (let y = 5561; y < 5727; y++) {
			coords.push({ x, y, id: `32${x}_${y}` });
		}
	}
	return coords;
}

export default defineRegion(
	'de/thueringen',
	{
		status: 'success',
		notes: [
			'No API, such as an ATOM feed, available.',
			'Parsing JSON or hardcoded IDs are required.',
			'Images are unnecessarily packed into container files, such as ZIP.',
			'Server is very slow.',
			'License requires attribution.',
			'National license instead of an international standard.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
		license: {
			name: 'DL-DE->BY-2.0',
			url: 'https://www.govdata.de/dl-de/by-2-0',
			requiresAttribution: true,
		},
		creator: {
			name: 'GDI-Th',
			url: 'https://geoportal.thueringen.de/gdi-th/download-offene-geodaten/download-luftbilder-und-orthophotos',
		},
		date: '2024',
	},
	[
		step('download-tiles', async (ctx) => {
			const tilesDir = join(ctx.dataDir, 'tiles');
			mkdirSync(tilesDir, { recursive: true });

			const coords = shuffle(generateCoords());

			await concurrent(
				coords,
				CONCURRENCY,
				async ({ x, y, id }) => {
					const destVersatiles = join(tilesDir, `${id}.versatiles`);
					const skipFile = join(tilesDir, `${id}.skip`);
					if (existsSync(destVersatiles) || existsSync(skipFile)) return 'skipped';

					const jsonPath = join(ctx.tempDir, `${id}.json`);
					const zipPath = join(ctx.tempDir, `${id}.zip`);
					const extractDir = join(ctx.tempDir, id);

					try {
						const bbox = `${x * 1000}&bbox%5B%5D=${y * 1000}&bbox%5B%5D=${(x + 1) * 1000}&bbox%5B%5D=${(y + 1) * 1000}`;
						const apiUrl = `https://geoportal.geoportal-th.de/gaialight-th/_apps/dladownload/_ajax/overview.php?crs=EPSG%3A25832&bbox%5B%5D=${bbox}&type%5B%5D=op`;

						await withRetry(() => downloadFile(apiUrl, jsonPath), { maxAttempts: 3 });
						const json = JSON.parse(await readFile(jsonPath, 'utf-8'));

						// Find the GID for this tile (most recent flight)
						const features = json.result?.features ?? [];
						type Feature = { properties: { bildnr: string; bildflugnr: number; gid: number } };
						const matching = (features as Feature[]).filter((f) => f.properties.bildnr === id);
						if (matching.length === 0) {
							writeFileSync(skipFile, '');
							return 'empty';
						}
						const best = matching.reduce((a, b) => (a.properties.bildflugnr > b.properties.bildflugnr ? a : b));

						const downloadUrl = `https://geoportal.geoportal-th.de/gaialight-th/_apps/dladownload/download.php?type=op&id=${best.properties.gid}`;
						await withRetry(() => runCommand('curl', ['-sko', zipPath, downloadUrl]), {
							maxAttempts: 3,
						});

						await runCommand('unzip', ['-qo', zipPath, '-d', extractDir]);

						// Find the single .tif file
						const files = await readdir(extractDir, { recursive: true });
						const tifFile = files.find((f) => typeof f === 'string' && f.endsWith('.tif'));
						if (!tifFile) {
							writeFileSync(skipFile, '');
							return 'empty';
						}

						// Convert to .versatiles (uses tmp. prefix internally)
						const srcTif = join(extractDir, tifFile);
						await runVersatilesRasterConvert(srcTif, destVersatiles);
						return 'converted';
					} catch {
						return 'empty';
					} finally {
						for (const p of [jsonPath, zipPath]) {
							try {
								rmSync(p, { force: true });
							} catch {}
						}
						try {
							rmSync(extractDir, { recursive: true, force: true });
						} catch {}
					}
				},
				{ labels: ['converted', 'skipped', 'empty'] },
			);

			await expectMinFiles(tilesDir, '*.versatiles', 50);
		}),
	],
);
