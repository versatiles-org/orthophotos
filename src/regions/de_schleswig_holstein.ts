import { existsSync, rmSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { downloadFile } from '../lib/command.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { isValidRaster } from '../lib/validators.ts';
import { runVersatilesRasterConvert } from '../run/commands.ts';

const ATOM_URL = 'https://service.gdi-sh.de/SH_OpenGBD/feeds/DOP20/DOP20.xml';
const TILE_XML_BASE = 'https://service.gdi-sh.de/SH_OpenGBD/feeds/DOP20/DOP20_';

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

export default defineTileRegion({
	name: 'de/schleswig_holstein',
	meta: {
		status: 'success',
		notes: [
			'Server is slow.',
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
			name: 'GeoBasis-DE/LVermGeo SH',
			url: 'https://opendata.schleswig-holstein.de/dataset/digitale-orthophotos-dop20',
		},
		date: '2017-2024',
	},
	init: async (ctx) => {
		const atomPath = join(ctx.tempDir, 'atom.xml');
		if (!existsSync(atomPath)) {
			console.log('  Fetching atom.xml...');
			await withRetry(() => downloadFile(ATOM_URL, atomPath), { maxAttempts: 3 });
		}
		const xml = await readFile(atomPath, 'utf-8');
		const ids = parseTileIds(xml);
		return ids.map((id) => ({ id }));
	},
	downloadConcurrency: 1,
	download: async ({ id }, { tempDir, errors }) => {
		const tileXmlPath = join(tempDir, `${id}.xml`);
		const tifPath = join(tempDir, `${id}.tif`);

		try {
			await withRetry(() => downloadFile(`${TILE_XML_BASE}${id}.xml`, tileXmlPath), { maxAttempts: 3 });

			const tileXml = await readFile(tileXmlPath, 'utf-8');
			const url = parseTileUrl(tileXml);
			if (!url) return 'empty';

			await withRetry(() => downloadFile(url, tifPath), { maxAttempts: 3 });

			const size = statSync(tifPath).size;
			if (size === 46) return 'empty';

			if (!(await isValidRaster(tifPath))) {
				errors.add(`${id}.tif (${url})`);
				return 'invalid';
			}

			return { tifPath };
		} catch (err) {
			for (const p of [tileXmlPath, tifPath]) {
				try {
					rmSync(p, { force: true });
				} catch {}
			}
			throw err;
		} finally {
			try {
				rmSync(tileXmlPath, { force: true });
			} catch {}
		}
	},
	convert: async ({ tifPath }, { dest }) => {
		try {
			await runVersatilesRasterConvert(tifPath, dest);
		} finally {
			try {
				rmSync(tifPath, { force: true });
			} catch {}
		}
	},
	minFiles: 123456,
});
