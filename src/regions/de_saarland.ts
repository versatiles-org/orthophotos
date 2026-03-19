import { existsSync, mkdirSync, rmSync, renameSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { defineRegion, step } from '../lib/framework.ts';
import { DownloadErrors, expectMinFiles, isValidRaster } from '../lib/validators.ts';
import { shuffle } from '../lib/array.ts';
import { downloadFile, runCommand } from '../lib/command.ts';
import { CONCURRENCY, concurrent } from '../lib/concurrent.ts';
import { withRetry } from '../lib/retry.ts';

const ATOM_URL =
	'https://geoportal.saarland.de/mapbender/php/mod_inspireDownloadFeed.php?id=e7995adf-2aeb-4fa4-a536-041e3cc8b24a&type=DATASET&generateFrom=wmslayer&layerid=46747';

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

export function parseAtomEntries(xml: string): { url: string; id: string }[] {
	const parsed = xmlParser.parse(xml);
	const entries: unknown[] = [parsed.feed?.entry ?? []].flat();
	const tiles: { url: string; id: string }[] = [];
	for (const entry of entries) {
		const links: unknown[] = [(entry as Record<string, unknown>).link ?? []].flat();
		for (const link of links) {
			const attrs = link as Record<string, string>;
			const href = (attrs['@_href'] ?? '').replace(/amp;/g, '');
			const title = attrs['@_title'] ?? '';
			if (href.includes('mapbender')) continue;
			const match = title.match(/Teil (\S+)/);
			if (match && href) {
				tiles.push({ url: href, id: match[1] });
			}
		}
	}
	return tiles;
}

export default defineRegion(
	'de/saarland',
	{
		status: 'success',
		notes: [
			'Server is slow.',
			'License requires attribution.',
			'National license instead of an international standard.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
		entries: ['tiles'],
		license: {
			name: 'DL-DE->BY-2.0',
			url: 'https://www.govdata.de/dl-de/by-2-0',
			requiresAttribution: true,
		},
		creator: {
			name: 'GeoBasis DE/LVGL-SL (2025)',
			url: 'https://geoportal.saarland.de/app-article/geobasisdatenuebersicht/',
		},
		date: '2023',
		vrt: {},
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
			const tiles = parseAtomEntries(xml);
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
			await expectMinFiles(tilesDir, '*.jp2', 10);
		}),
	],
);
