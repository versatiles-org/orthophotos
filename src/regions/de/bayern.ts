import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
	createXmlParser,
	defineTileRegion,
	downloadFile,
	downloadRaster,
	pipeline,
	runMosaicTile,
	safeRm,
	shuffle,
	withRetry,
} from '../../lib/region-api.ts';

const KML_URL = 'https://geodaten.bayern.de/odd/a/dop20/meta/kml/gemeinde.kml';

const xmlParser = createXmlParser();

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

export default defineTileRegion({
	name: 'de/bayern',
	meta: {
		status: 'released',
		notes: [
			'No API, such as an ATOM feed, available.',
			'A hacky solution is required: Parse gemeinde.kml in the hope that it is up to date and references all images.',
			'License requires attribution.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
		entries: ['result'],
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
		releaseDate: '2026-03-21',
	},
	init: async (ctx) => {
		const kmlPath = join(ctx.tempDir, 'gemeinde.kml');
		if (!existsSync(kmlPath)) {
			console.log('  Fetching gemeinde.kml...');
			await withRetry(() => downloadFile(KML_URL, kmlPath), { maxAttempts: 3 });
		}

		const urlsPath = join(ctx.tempDir, 'tile_urls.json');
		if (!existsSync(urlsPath)) {
			const kml = await readFile(kmlPath, 'utf-8');
			const meta4Urls = parseMeta4Urls(kml);
			console.log(`  Found ${meta4Urls.length} gemeinde meta4 URLs`);

			const allTileUrls = new Set<string>();
			await pipeline(shuffle(meta4Urls), { progress: { labels: ['fetched'] } }).forEach(4, async (url) => {
				const meta4Path = join(ctx.tempDir, basename(url));
				try {
					await withRetry(() => downloadFile(url, meta4Path), { maxAttempts: 3 });
					const meta4Xml = await readFile(meta4Path, 'utf-8');
					for (const tileUrl of parseTileUrls(meta4Xml)) {
						allTileUrls.add(tileUrl);
					}
				} finally {
					safeRm(meta4Path);
				}
				return 'fetched';
			});

			const urls = [...allTileUrls];
			await writeFile(urlsPath, JSON.stringify(urls));
			console.log(`  Found ${urls.length} unique tile URLs`);
		}

		const urls: string[] = JSON.parse(await readFile(urlsPath, 'utf-8'));
		return urls.map((url) => ({ id: basename(url, '.tif'), url }));
	},
	download: async ({ url, id }, ctx) => {
		const tifPath = ctx.tempFile(join(ctx.tempDir, `${id}.tif`));
		const result = await downloadRaster(url, tifPath, ctx.errors, `${id}.tif`);
		if (result === 'invalid') return 'invalid';
		return { tifPath };
	},
	convert: async ({ tifPath }, { dest }) => {
		await runMosaicTile(tifPath, dest);
	},
	minFiles: 2220,
});
