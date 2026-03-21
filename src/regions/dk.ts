import { existsSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { downloadFile, runCommand } from '../lib/command.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { computeWmsBlocks, generateWmsXml, parseWmsCapabilities } from '../lib/wms.ts';
import { runVersatilesRasterConvert } from '../run/commands.ts';

const LAYER = 'orto_foraar_12_5';
const ZOOM = 17;

async function extractToken(tempDir: string): Promise<string> {
	const htmlPath = join(tempDir, 'dk_index.html');
	if (!existsSync(htmlPath)) {
		await withRetry(() => downloadFile('https://dataforsyningen.dk/', htmlPath), { maxAttempts: 3 });
	}
	const html = await readFile(htmlPath, 'utf-8');
	const jsMatch = html.match(/src="(\/assets\/index-[^"]+\.js)"/);
	if (!jsMatch) throw new Error('Could not find index JS file on dataforsyningen.dk');

	const jsPath = join(tempDir, 'dk_index.js');
	if (!existsSync(jsPath)) {
		await withRetry(() => downloadFile(`https://dataforsyningen.dk${jsMatch[1]}`, jsPath), { maxAttempts: 3 });
	}
	const js = await readFile(jsPath, 'utf-8');
	const tokenMatch = js.match(/,cg="([^"]+)"/);
	if (!tokenMatch) throw new Error('Could not extract token from JS');
	return tokenMatch[1];
}

export default defineTileRegion({
	name: 'dk',
	meta: {
		status: 'success',
		notes: ['License requires attribution', 'Only WMS available', 'Access requires token'],
		entries: ['result'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'GeoDanmark',
			url: 'https://dataforsyningen.dk/data/981',
		},
		date: '2024',
	},
	init: async (ctx) => {
		const token = await extractToken(ctx.tempDir);
		const wmsUrl = `https://api.dataforsyningen.dk/orto_foraar_DAF?token=${token}`;

		const capsPath = join(ctx.tempDir, 'caps.xml');
		if (!existsSync(capsPath)) {
			console.log('  Fetching WMS capabilities...');
			await withRetry(() => downloadFile(`${wmsUrl}&service=WMS&request=GetCapabilities&version=1.1.1`, capsPath), {
				maxAttempts: 3,
			});
		}

		const wmsXmlPath = join(ctx.tempDir, 'wms.xml');
		if (!existsSync(wmsXmlPath)) {
			await generateWmsXml(wmsUrl, LAYER, wmsXmlPath);
		}

		const { bbox, maxWidth, maxHeight } = await parseWmsCapabilities(capsPath, LAYER);
		const { items, blockPx } = computeWmsBlocks(bbox, ZOOM, maxWidth, maxHeight);
		console.log(`  ${items.length} blocks at ${blockPx}x${blockPx}px`);

		return items.map((item) => ({ ...item, wmsXmlPath, blockPx }));
	},
	downloadConcurrency: 1,
	download: async (item, { tempDir }) => {
		const tifPath = join(tempDir, `${item.id}.tif`);
		const maskedPath = join(tempDir, `${item.id}_masked.tif`);

		try {
			await runCommand('gdal_translate', [
				'-q',
				item.wmsXmlPath as string,
				tifPath,
				'-projwin',
				String(item.x0),
				String(item.y1),
				String(item.x1),
				String(item.y0),
				'-projwin_srs',
				'EPSG:3857',
				'-outsize',
				String(item.blockPx),
				String(item.blockPx),
				'-of',
				'GTiff',
				'-co',
				'COMPRESS=DEFLATE',
				'-co',
				'PREDICTOR=2',
				'-co',
				'ALPHA=YES',
			]);

			// Black background → transparent
			await runCommand('gdal', ['raster', 'edit', '--nodata', '0', tifPath]);
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
				maskedPath,
			]);

			return { srcPath: maskedPath };
		} catch (err) {
			try {
				rmSync(maskedPath, { force: true });
			} catch {}
			throw err;
		} finally {
			try {
				rmSync(tifPath, { force: true });
			} catch {}
		}
	},
	convert: async ({ srcPath }, { dest }) => {
		try {
			await runVersatilesRasterConvert(srcPath as string, dest);
		} finally {
			try {
				rmSync(srcPath as string, { force: true });
			} catch {}
		}
	},
	minFiles: 10,
});
