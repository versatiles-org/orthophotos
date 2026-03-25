import { existsSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { downloadFile } from '../lib/command.ts';
import { extractZipFile, safeRm } from '../lib/fs.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { runMosaicTile } from '../run/commands.ts';

const ATOM_URL = 'https://atom.cuzk.gov.cz/OI/OI.xml';
const ZIP_BASE_URL = 'https://openzu.cuzk.gov.cz/opendata/OI/';

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

/**
 * Parse tile IDs from the main Atom feed.
 * Entry IDs contain paths like "CZ-00025712-CUZK_OI_302_5550".
 */
export function parseTileIds(xml: string): { id: string; url: string }[] {
	const parsed = xmlParser.parse(xml);
	const entries: unknown[] = [parsed.feed?.entry ?? []].flat();
	const items: { id: string; url: string }[] = [];
	const seen = new Set<string>();
	for (const entry of entries) {
		const links: unknown[] = [(entry as Record<string, unknown>).link ?? []].flat();
		for (const link of links) {
			const attrs = link as Record<string, string>;
			if (attrs['@_rel'] !== 'alternate') continue;
			const href = attrs['@_href'] ?? '';
			const match = href.match(/CUZK_OI_(\d+_\d+)\.xml$/);
			if (match && !seen.has(match[1])) {
				seen.add(match[1]);
				items.push({ id: match[1], url: `${ZIP_BASE_URL}${match[1]}.zip` });
			}
		}
	}
	return items;
}

export default defineTileRegion({
	name: 'cz',
	meta: {
		status: 'released',
		notes: ['License requires attribution.', 'JP2 files have no embedded CRS; worldfile + EPSG:3045 assumed.'],
		entries: ['result'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'ČÚZK',
			url: 'https://geoportal.cuzk.gov.cz/(S(zggl1k35qp1wg4q33q1a5gov))/Default.aspx?mode=TextMeta&text=ortofoto_info&side=ortofoto',
		},
		date: '2024-2025',
	},
	init: async (ctx) => {
		const atomPath = join(ctx.tempDir, 'atom.xml');
		if (!existsSync(atomPath)) {
			console.log('  Fetching atom.xml...');
			await withRetry(() => downloadFile(ATOM_URL, atomPath), { maxAttempts: 3 });
		}
		const xml = await readFile(atomPath, 'utf-8');
		return parseTileIds(xml);
	},
	download: async ({ url, id }, { tempDir }) => {
		const zipPath = join(tempDir, `${id}.zip`);
		const extractDir = join(tempDir, id);

		await withRetry(() => downloadFile(url, zipPath), { maxAttempts: 3 });
		await extractZipFile(zipPath, extractDir);
		rmSync(zipPath, { force: true });

		const jp2Path = join(extractDir, `${id}.jp2`);
		if (!existsSync(jp2Path)) return 'empty';

		return { jp2Path, extractDir };
	},
	convert: async ({ jp2Path, extractDir }, { dest }) => {
		// JP2 has no embedded CRS; coordinates come from .j2w worldfile in EPSG:3045.
		// White borders (255,255,255) are treated as transparent via --nodata.
		await runMosaicTile(jp2Path, dest, { crs: '3045', nodata: '255,255,255' });
		safeRm(extractDir);
	},
	minFiles: 20000,
});
