import { existsSync, mkdirSync, rmSync, renameSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { defineRegion, step } from '../lib/framework.ts';
import { DownloadErrors, expectMinFiles, isValidRaster } from '../lib/validators.ts';
import { shuffle } from '../lib/array.ts';
import { downloadFile, runCommand } from '../lib/command.ts';
import { CONCURRENCY, concurrent } from '../lib/concurrent.ts';
import { withRetry } from '../lib/retry.ts';

const KML_URL = 'https://geodaten.bayern.de/odd/a/dop20/meta/kml/gemeinde.kml';

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

export function parseMeta4Urls(kml: string): string[] {
	const pattern = /https:\/\/geodaten\.bayern\.de\/odd\/a\/dop20\/meta\/metalink\/[0-9]+\.meta4/g;
	const matches = kml.match(pattern) ?? [];
	return [...new Set(matches)];
}

export function parseTileUrls(meta4Xml: string): string[] {
	const parsed = xmlParser.parse(meta4Xml);
	const files: unknown[] = [parsed.metalink?.file ?? []].flat();
	const urls: string[] = [];
	for (const file of files) {
		const fileUrls: unknown[] = [(file as Record<string, unknown>).url ?? []].flat();
		const first = fileUrls[0];
		if (typeof first === 'string') urls.push(first);
	}
	return urls;
}

export default defineRegion(
	'de/bayern',
	{
		status: 'success',
		notes: [
			'No API, such as an ATOM feed, available.',
			'A hacky solution is required: Parse gemeinde.kml in the hope that it is up to date and references all images.',
			'License requires attribution.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
		entries: ['tiles'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'Bayerische Vermessungsverwaltung - www.geodaten.bayern.de',
			url: 'https://geodaten.bayern.de/opengeodata/OpenDataDetail.html?pn=dop20rgb',
		},
		date: '2025-06',
		vrt: {},
	},
	[
		step('fetch-kml', async (ctx) => {
			const kmlPath = join(ctx.tempDir, 'gemeinde.kml');
			if (!existsSync(kmlPath)) {
				console.log('  Fetching gemeinde.kml...');
				await withRetry(() => downloadFile(KML_URL, kmlPath), { maxAttempts: 3 });
			}
		}),

		step('fetch-tile-urls', async (ctx) => {
			const urlsPath = join(ctx.tempDir, 'tile_urls.json');
			if (existsSync(urlsPath)) {
				const urls: string[] = JSON.parse(await readFile(urlsPath, 'utf-8'));
				console.log(`  ${urls.length} tile URLs already cached`);
				return;
			}

			const kml = await readFile(join(ctx.tempDir, 'gemeinde.kml'), 'utf-8');
			const meta4Urls = parseMeta4Urls(kml);
			console.log(`  Found ${meta4Urls.length} gemeinde meta4 URLs`);

			const allTileUrls = new Set<string>();
			await concurrent(
				shuffle(meta4Urls),
				CONCURRENCY,
				async (url) => {
					const meta4Path = join(ctx.tempDir, basename(url));
					try {
						await withRetry(() => downloadFile(url, meta4Path), { maxAttempts: 3 });
						const meta4Xml = await readFile(meta4Path, 'utf-8');
						for (const tileUrl of parseTileUrls(meta4Xml)) {
							allTileUrls.add(tileUrl);
						}
					} finally {
						try {
							rmSync(meta4Path, { force: true });
						} catch {}
					}
					return 'fetched';
				},
				{ labels: ['fetched'] },
			);

			const urls = [...allTileUrls];
			await writeFile(urlsPath, JSON.stringify(urls));
			console.log(`  Found ${urls.length} unique tile URLs`);
		}),

		step('download-tiles', async (ctx) => {
			const tilesDir = join(ctx.dataDir, 'tiles');
			mkdirSync(tilesDir, { recursive: true });

			const urls: string[] = JSON.parse(await readFile(join(ctx.tempDir, 'tile_urls.json'), 'utf-8'));

			const errors = new DownloadErrors();

			await concurrent(
				shuffle(urls),
				CONCURRENCY,
				async (url) => {
					const id = basename(url, '.tif');
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
