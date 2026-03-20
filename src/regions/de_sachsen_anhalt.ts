import { existsSync, mkdirSync, rmSync, renameSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { defineRegion, step } from '../lib/framework.ts';
import { ErrorBucket, expectMinFiles, isValidRaster } from '../lib/validators.ts';
import { shuffle } from '../lib/array.ts';
import { downloadFile, runCommand } from '../lib/command.ts';
import { CONCURRENCY, concurrent } from '../lib/concurrent.ts';
import { withRetry } from '../lib/retry.ts';

const ATOM_URL =
	'https://geodatenportal.sachsen-anhalt.de/arcgisinspire/rest/directories/web/INSPIRE_ALKIS/ALKIS_OI_DOP20_MapServer/datasetoi.xml';
const DOWNLOAD_BASE = 'https://www.geodatenportal.sachsen-anhalt.de/gfds_webshare/sec-download/LVermGeo/DOP20/';

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

export function parseTileIds(xml: string): string[] {
	const parsed = xmlParser.parse(xml);
	const entries: unknown[] = [parsed.feed?.entry ?? []].flat();
	const ids = new Set<string>();
	for (const entry of entries) {
		const links: unknown[] = [(entry as Record<string, unknown>).link ?? []].flat();
		for (const link of links) {
			const attrs = link as Record<string, string>;
			const href = (attrs['@_href'] ?? '').replace(/amp;/g, '');
			const matches = href.match(/\d+/g);
			if (matches) {
				for (const m of matches) {
					if (m.length >= 4) ids.add(m);
				}
			}
		}
	}
	return [...ids];
}

export default defineRegion(
	'de/sachsen_anhalt',
	{
		status: 'success',
		notes: [
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
			name: 'GeoBasis-DE / LVermGeo ST',
			url: 'https://www.lvermgeo.sachsen-anhalt.de/de/gdp-open-data.html',
		},
		date: '2020',
		vrt: { defaults: { addalpha: false, allowProjectionDifference: true, srs: 'EPSG:25832' } },
	},
	[
		step('fetch-atom', async (ctx) => {
			const atomPath = join(ctx.tempDir, 'atom.xml');
			if (!existsSync(atomPath)) {
				console.log('  Fetching atom.xml...');
				await withRetry(() => downloadFile(ATOM_URL, atomPath), { maxAttempts: 3 });
			}

			const xml = await readFile(atomPath, 'utf-8');
			const ids = parseTileIds(xml);
			await writeFile(join(ctx.tempDir, 'ids.json'), JSON.stringify(ids));
			console.log(`  Found ${ids.length} tile IDs`);
		}),

		step('download-tiles', async (ctx) => {
			const tilesDir = join(ctx.dataDir, 'tiles');
			mkdirSync(tilesDir, { recursive: true });

			const ids: string[] = JSON.parse(await readFile(join(ctx.tempDir, 'ids.json'), 'utf-8'));

			const errors = new ErrorBucket();

			await concurrent(
				shuffle(ids),
				CONCURRENCY,
				async (id) => {
					const destJp2 = join(tilesDir, `${id}.jp2`);
					if (existsSync(destJp2)) return 'skipped';

					const tifPath = join(ctx.tempDir, `${id}.tif`);
					const jp2Path = join(ctx.tempDir, `${id}.jp2`);
					const url = `${DOWNLOAD_BASE}${id}.tif`;

					try {
						await withRetry(() => downloadFile(url, tifPath), { maxAttempts: 3 });

						if (!(await isValidRaster(tifPath))) {
							errors.add(`Invalid raster: ${url}, file: ${id}.tif`);
							return 'invalid';
						}

						await runCommand('gdal', ['raster', 'edit', '--nodata', '255', tifPath]);
						await runCommand('gdal_translate', [
							'-q',
							'-b',
							'1',
							'-b',
							'2',
							'-b',
							'3',
							'-b',
							'mask',
							'-colorinterp_4',
							'alpha',
							tifPath,
							jp2Path,
						]);

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
