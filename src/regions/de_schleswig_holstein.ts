import { mkdirSync, existsSync, statSync, renameSync, rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { defineRegion, step } from '../lib/framework.ts';
import { ErrorBucket, expectMinFiles, isValidRaster } from '../lib/validators.ts';
import { shuffle } from '../lib/array.ts';
import { downloadFile, runCommand } from '../lib/command.ts';
import { concurrent } from '../lib/concurrent.ts';
import { withRetry } from '../lib/retry.ts';

const ATOM_URL = 'https://service.gdi-sh.de/SH_OpenGBD/feeds/DOP20/DOP20.xml';
const TILE_XML_BASE = 'https://service.gdi-sh.de/SH_OpenGBD/feeds/DOP20/DOP20_';
const CONCURRENCY = 1;

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

export function parseTileIds(xml: string): string[] {
	const parsed = xmlParser.parse(xml);
	const entries: unknown[] = [parsed.feed?.entry ?? []].flat();
	const ids: string[] = [];
	for (const entry of entries) {
		const links: unknown[] = [(entry as Record<string, unknown>).link ?? []].flat();
		for (const link of links) {
			const attrs = link as Record<string, string>;
			if (attrs['@_rel'] !== 'alternate') continue;
			const href = attrs['@_href'] ?? '';
			const match = href.match(/DOP20_(dop20rgbi[^.]+)\.xml$/);
			if (match) ids.push(match[1]);
		}
	}
	return ids;
}

export function parseTileUrl(xml: string): string | undefined {
	const parsed = xmlParser.parse(xml);
	const entries: unknown[] = [parsed.feed?.entry ?? []].flat();
	for (const entry of entries) {
		const links: unknown[] = [(entry as Record<string, unknown>).link ?? []].flat();
		for (const link of links) {
			const attrs = link as Record<string, string>;
			if (attrs['@_rel'] !== 'alternate') continue;
			const href = attrs['@_href'] ?? '';
			if (href.includes('INTERPOLATION=cubic')) {
				return href.replace(/amp;/g, '');
			}
		}
	}
	return undefined;
}

async function processTile(
	id: string,
	tilesDir: string,
	tempDir: string,
	errors: ErrorBucket,
): Promise<'skipped' | 'converted' | 'empty' | 'invalid'> {
	const destJp2 = join(tilesDir, `${id}.jp2`);
	if (existsSync(destJp2)) return 'skipped';

	const tileXmlPath = join(tempDir, `${id}.xml`);
	const tifPath = join(tempDir, `${id}.tif`);
	const jp2Path = join(tempDir, `${id}.jp2`);

	try {
		await withRetry(() => downloadFile(`${TILE_XML_BASE}${id}.xml`, tileXmlPath), { maxAttempts: 3 });

		const tileXml = await readFile(tileXmlPath, 'utf-8');
		const url = parseTileUrl(tileXml);
		if (!url) {
			return 'empty';
		}

		await withRetry(() => downloadFile(url, tifPath), { maxAttempts: 3 });

		const size = statSync(tifPath).size;
		if (size === 46) {
			return 'empty';
		}

		if (!(await isValidRaster(tifPath))) {
			errors.add(`Invalid raster: ${url}, file: ${id}.tif`);
			return 'invalid';
		}

		try {
			await runCommand('gdal_translate', ['-q', tifPath, jp2Path, '-co', 'QUALITY=100']);
		} catch {
			errors.add(`Failed to convert raster: ${url}, file: ${id}.tif`);
			return 'invalid';
		}
		renameSync(jp2Path, destJp2);
		return 'converted';
	} finally {
		for (const ext of ['.xml', '.tif', '.jp2']) {
			const p = join(tempDir, `${id}${ext}`);
			try {
				rmSync(p, { force: true });
			} catch {}
		}
	}
}

export default defineRegion(
	'de/schleswig_holstein',
	{
		status: 'success',
		notes: [
			'Server is slow.',
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
			name: 'GeoBasis-DE/LVermGeo SH',
			url: 'https://opendata.schleswig-holstein.de/dataset/digitale-orthophotos-dop20',
		},
		date: '2017-2024',
		vrt: { defaults: { bands: [1, 2, 3] } },
	},
	[
		step('fetch-index', async (ctx) => {
			const atomPath = join(ctx.tempDir, 'atom.xml');
			if (!existsSync(atomPath)) {
				console.log('  Fetching atom.xml...');
				await withRetry(() => downloadFile(ATOM_URL, atomPath), { maxAttempts: 3 });
			}
		}),

		step('parse-ids', async (ctx) => {
			const atomPath = join(ctx.tempDir, 'atom.xml');
			const xml = await readFile(atomPath, 'utf-8');
			const ids = parseTileIds(xml);
			await writeFile(join(ctx.tempDir, 'ids.json'), JSON.stringify(ids));
			console.log(`  Found ${ids.length} tile IDs`);
		}),

		step('download-tiles', async (ctx) => {
			const tilesDir = join(ctx.dataDir, 'tiles');
			mkdirSync(tilesDir, { recursive: true });

			const ids: string[] = JSON.parse(await readFile(join(ctx.tempDir, 'ids.json'), 'utf-8'));
			const shuffled = shuffle(ids);

			const errors = new ErrorBucket();

			await concurrent(
				shuffled,
				CONCURRENCY,
				async (id) => {
					return await processTile(id, tilesDir, ctx.tempDir, errors);
				},
				{ labels: ['converted', 'skipped', 'empty', 'invalid'] },
			);

			errors.throwIfAny();
			await expectMinFiles(tilesDir, '*.jp2', 50);
		}),
	],
);
