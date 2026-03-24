import { existsSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { downloadFile, runCommand } from '../lib/command.ts';
import { extractZipFile } from '../lib/fs.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { runVersatilesRasterConvert } from '../run/commands.ts';

const ATOM_URL = 'https://atom.cuzk.gov.cz/OI/OI.xml';

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

export function parseTileXmlUrls(xml: string): { xmlUrl: string; id: string }[] {
	const parsed = xmlParser.parse(xml);
	const entries: unknown[] = [parsed.feed?.entry ?? []].flat();
	const items: { xmlUrl: string; id: string }[] = [];
	for (const entry of entries) {
		const entryId = String((entry as Record<string, unknown>).id ?? '');
		if (!entryId) continue;
		const match = entryId.match(/(\d+_\d+)/);
		if (match) {
			items.push({ xmlUrl: entryId, id: match[1] });
		}
	}
	return items;
}

export function parseZipUrl(xml: string): string | undefined {
	const parsed = xmlParser.parse(xml);
	const entries: unknown[] = [parsed.feed?.entry ?? []].flat();
	for (const entry of entries) {
		const entryId = String((entry as Record<string, unknown>).id ?? '');
		if (entryId) return entryId;
	}
	return undefined;
}

export default defineTileRegion({
	name: 'cz',
	meta: {
		status: 'success',
		notes: ['License requires attribution.'],
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
		return parseTileXmlUrls(xml);
	},
	download: async ({ xmlUrl, id }, { tempDir }) => {
		const tileXmlPath = join(tempDir, `${id}.xml`);
		const zipPath = join(tempDir, `${id}.zip`);
		const extractDir = join(tempDir, id);

		try {
			await withRetry(() => downloadFile(xmlUrl as string, tileXmlPath), { maxAttempts: 3 });
			const tileXml = await readFile(tileXmlPath, 'utf-8');
			const zipUrl = parseZipUrl(tileXml);
			if (!zipUrl) return 'empty';

			await withRetry(() => downloadFile(zipUrl, zipPath), { maxAttempts: 3 });
			await extractZipFile(zipPath, extractDir);
			rmSync(zipPath, { force: true });

			const jp2Path = join(extractDir, `${id}.jp2`);
			if (!existsSync(jp2Path)) return 'empty';

			return { jp2Path, extractDir };
		} catch (err) {
			for (const p of [tileXmlPath, zipPath]) {
				try {
					rmSync(p, { force: true });
				} catch {}
			}
			try {
				rmSync(extractDir, { recursive: true, force: true });
			} catch {}
			throw err;
		} finally {
			try {
				rmSync(tileXmlPath, { force: true });
			} catch {}
		}
	},
	convert: async ({ jp2Path, extractDir }, { dest, tempDir }) => {
		const id = jp2Path.match(/([^/]+)\.jp2$/)?.[1] ?? 'tile';
		const alphaPath = join(tempDir, `${id}_alpha.tif`);
		const rgbVrt = join(tempDir, `${id}_rgb.vrt`);
		const rgbaVrt = join(tempDir, `${id}_rgba.vrt`);

		try {
			// Create alpha mask: opaque where any band < 254, transparent where all bands >= 254
			await runCommand('gdal', [
				'raster',
				'calc',
				'-i',
				`A=${jp2Path}`,
				'--calc=255*(((A[1]<254)+(A[2]<254)+(A[3]<254))>0)',
				'--overwrite',
				'--datatype=Byte',
				'-o',
				alphaPath,
			]);

			// Build RGB VRT from JP2 (bands 1-3)
			await runCommand('gdalbuildvrt', [
				'-b',
				'1',
				'-b',
				'2',
				'-b',
				'3',
				'-a_srs',
				'EPSG:3045',
				rgbVrt,
				jp2Path as string,
			]);

			// Combine RGB + alpha into RGBA VRT
			await runCommand('gdalbuildvrt', ['-separate', rgbaVrt, rgbVrt, alphaPath]);

			throw new Error('not implemented from here');
			// Set ColorInterp for proper band identification
			await runCommand('xmlstarlet', [
				'ed',
				'-L',
				'-s',
				"/VRTDataset/VRTRasterBand[@band='1'][not(ColorInterp)]",
				'-t',
				'elem',
				'-n',
				'ColorInterp',
				'-v',
				'Red',
				'-s',
				"/VRTDataset/VRTRasterBand[@band='2'][not(ColorInterp)]",
				'-t',
				'elem',
				'-n',
				'ColorInterp',
				'-v',
				'Green',
				'-s',
				"/VRTDataset/VRTRasterBand[@band='3'][not(ColorInterp)]",
				'-t',
				'elem',
				'-n',
				'ColorInterp',
				'-v',
				'Blue',
				'-s',
				"/VRTDataset/VRTRasterBand[@band='4'][not(ColorInterp)]",
				'-t',
				'elem',
				'-n',
				'ColorInterp',
				'-v',
				'Alpha',
				rgbaVrt,
			]);

			await runVersatilesRasterConvert(rgbaVrt, dest);
		} finally {
			for (const p of [alphaPath, rgbVrt, rgbaVrt]) {
				try {
					rmSync(p, { force: true });
				} catch {}
			}
			try {
				rmSync(extractDir, { recursive: true, force: true });
			} catch {}
		}
	},
	minFiles: 123456,
});
