import { existsSync, mkdirSync, rmSync, renameSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineRegion, step } from '../lib/framework.ts';
import { DownloadErrors, expectMinFiles, isValidRaster } from '../lib/validators.ts';
import { shuffle } from '../lib/array.ts';
import { downloadFile, runCommand } from '../lib/command.ts';
import { concurrent } from '../lib/concurrent.ts';
import { withRetry } from '../lib/retry.ts';

const ATOM_URL = 'https://www.geodaten-mv.de/dienste/dop20_atom?type=dataset&id=f94d17fa-b29b-41f7-a4b8-6e10f1aae38e';
const CONCURRENCY = 8;

export function parseTileUrls(xml: string): { url: string; id: string }[] {
	const tiles: { url: string; id: string }[] = [];
	const pattern = /href="([^"]*dop20rgbi_[^"]*\.tif[^"]*)"/g;
	let match;
	while ((match = pattern.exec(xml)) !== null) {
		const url = match[1].replace(/amp;/g, '');
		const fileMatch = url.match(/file=([^&]+)/);
		if (fileMatch) {
			tiles.push({ url, id: fileMatch[1] });
		}
	}
	return tiles;
}

export default defineRegion(
	'de/mecklenburg_vorpommern',
	{
		status: 'success',
		notes: [
			'Server is slow.',
			'License requires attribution.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'GeoBasis-DE/M-V',
			url: 'https://www.geoportal-mv.de/portal/Suche/Metadatenuebersicht/Details/Downloaddienst%20Digitale%20Orthophotos%2020cm%20MV%20(ATOM_MV_DOP)/0dea084c-5d2f-4aa0-a974-481dcd85a0ab',
		},
		date: '2024',
	},
	[
		step('fetch-atom', async (ctx) => {
			const atomPath = join(ctx.tempDir, 'atom.xml');
			if (!existsSync(atomPath)) {
				console.log('  Fetching atom.xml...');
				await withRetry(() => downloadFile(ATOM_URL, atomPath), { maxAttempts: 3 });
			}
		}),

		step('download-tiles', async (ctx) => {
			const tilesDir = join(ctx.dataDir, 'tiles');
			mkdirSync(tilesDir, { recursive: true });

			const xml = await readFile(join(ctx.tempDir, 'atom.xml'), 'utf-8');
			const tiles = parseTileUrls(xml);
			console.log(`  Found ${tiles.length} tiles`);

			const errors = new DownloadErrors();

			await concurrent(
				shuffle(tiles),
				CONCURRENCY,
				async ({ url, id }) => {
					const destJp2 = join(tilesDir, `${id}.jp2`);
					if (existsSync(destJp2)) return 'skipped';

					const tifPath = join(ctx.tempDir, `${id}.tif`);
					const jp2Path = join(ctx.tempDir, `${id}.jp2`);
					try {
						await withRetry(() => downloadFile(url, tifPath), { maxAttempts: 3 });
						if (!(await isValidRaster(tifPath))) {
							errors.add(url, `${id}.tif`);
							return 'invalid';
						}
						await runCommand('gdal_translate', ['-q', tifPath, jp2Path]);
						renameSync(jp2Path, destJp2);
						return 'converted';
					} finally {
						for (const p of [tifPath, jp2Path]) {
							try {
								rmSync(p, { force: true });
							} catch {}
						}
					}
				},
				{ labels: ['converted', 'skipped', 'invalid'] },
			);

			errors.throwIfAny();
			await expectMinFiles(tilesDir, '*.jp2', 50);
		}),
	],
);
