import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
	defineTileRegion,
	getConfig,
	isValidRaster,
	PATIENT_RETRY,
	runMosaicTile,
	sleep,
	withRetry,
} from '../lib/index.ts';

/**
 * PNOA Máxima Actualidad, the always-current national orthophoto of IGN and CNIG, as COGs on the
 * MTN25 sheet grid.
 *
 * CNIG doesn't allow scripted downloads: since September 2026 each download needs a reCAPTCHA
 * token, and the download form flags automated browsers. So the COGs are downloaded by hand with
 * CNIG's own tool (the cart and its Open Web Start downloader) into the folder `es_pnoa_dir` from
 * `config.env`, outside `dir_temp` so that the delete task never removes them. This region only
 * reads that folder. The file list comes from the open listing of the series, so a file missing
 * in the folder, or one cut short, fails the run instead of leaving a hole.
 */

const LISTING_URL = 'https://centrodedescargas.cnig.es/CentroDescargas/archivosSerie';
/** Series 02211 is PNOA Máxima Actualidad, here its COG files. */
const LISTING_PARAMS = { codAgr: 'FOTOR', codSerie: '02211', codTipoArchivo: 'COG', orderBy: '' };
const USER_AGENT = 'versatiles-orthophotos (https://github.com/versatiles-org/orthophotos)';

export interface PnoaFile {
	/** Flight month and file name, e.g. `202309_PNOA-MA-OF-ETRS89-HU29-H25-0001-2`; newer IDs are drawn on top. */
	id: string;
	/** File name in the folder, e.g. `PNOA-MA-OF-ETRS89-HU29-H25-0001-2.TIF`. */
	name: string;
	/** CNIG's file number (`sec`). */
	sec: string;
	/** Size in MB as listed. */
	sizeMb: number;
}

/** The files of one page of the `archivosSerie` listing (20 rows), or none past the last page. */
export function parseListingPage(html: string): PnoaFile[] {
	const files: PnoaFile[] = [];
	for (const [, row] of html.matchAll(/<tr class="fontSize08em row100">([\s\S]*?)<\/tr>/g)) {
		const cell = (th: string): string | undefined => {
			const m = row.match(new RegExp(`data-th="${th}[^"]*"[\\s\\S]*?<div class="col-m-8[^"]*">\\s*([^<]*?)\\s*</div>`));
			return m?.[1];
		};
		const name = cell('Nombre');
		const date = cell('Fecha')?.match(/^(\d{2})\/(\d{4})$/);
		const size = cell('Tama');
		const sec = row.match(/detalleArchivo\?sec=(\d+)/)?.[1];
		if (!name || !date || !size || !sec) throw new Error(`Unexpected row in the CNIG listing: ${row.slice(0, 300)}`);
		files.push({
			id: `${date[2]}${date[1]}_${name.replace(/\.tiff?$/i, '')}`,
			name,
			sec,
			sizeMb: Number(size),
		});
	}
	return files;
}

/** Lists the whole series, one page at a time with a pause, as the CNIG server is shared. */
async function listSeries(): Promise<PnoaFile[]> {
	const files: PnoaFile[] = [];
	for (let page = 1; ; page++) {
		const body = new URLSearchParams({ numPagina: String(page), ...LISTING_PARAMS });
		const html = await withRetry(async () => {
			const res = await fetch(LISTING_URL, { method: 'POST', body, headers: { 'User-Agent': USER_AGENT } });
			if (!res.ok) throw new Error(`CNIG listing page ${page} failed: ${res.status} ${res.statusText}`);
			return res.text();
		}, PATIENT_RETRY);
		const rows = parseListingPage(html);
		if (rows.length === 0) break;
		files.push(...rows);
		if (page % 100 === 0) console.log(`  ${files.length} files after ${page} pages...`);
		await sleep(1000);
	}
	return files;
}

/** The folder with the hand-downloaded COGs, from `es_pnoa_dir` in `config.env`. */
function pnoaDir(): string {
	const dir = getConfig().esPnoaDir;
	if (!dir) throw new Error('Set es_pnoa_dir in config.env to the folder with the PNOA COGs downloaded from CNIG');
	if (!existsSync(dir)) throw new Error(`es_pnoa_dir "${dir}" does not exist`);
	return dir;
}

/** Draws newer flights on top where sheets overlap. */
export function flightMonthPriority(id: string): number {
	return Number(id.slice(0, 6)) || 0;
}

export default defineTileRegion({
	name: 'es',
	meta: {
		status: 'scraping',
		notes: [
			'PNOA Máxima Actualidad (always-current national orthophoto) by IGN and CNIG, as COGs on the MTN25 sheet grid.',
			'CNIG blocks scripted downloads (reCAPTCHA on every download since September 2026), so the COGs are downloaded by hand with the cart and its Open Web Start downloader.',
			'The open listing of the series is used to check that every file is there and complete.',
			'The WMS (www.ign.es/wms-inspire/pnoa-ma) is behind a CloudFront WAF that answers bulk requests with 502.',
			'License requires attribution: "Obra derivada de PNOA CC-BY 4.0 scne.es".',
		],
		entries: ['result'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'Instituto Geográfico Nacional / Sistema Cartográfico Nacional',
			url: 'https://centrodedescargas.cnig.es/CentroDescargas/ortofoto-pnoa-maxima-actualidad',
		},
		mask: true,
		checked: '2026-11-16',
	},
	init: async () => {
		pnoaDir();
		console.log('  Listing PNOA Máxima Actualidad at CNIG...');
		return listSeries();
	},
	download: async ({ name, sizeMb }, ctx) => {
		// The file belongs to the hand-downloaded folder: never register it with ctx.tempFile.
		const path = join(pnoaDir(), name);
		if (!existsSync(path)) {
			ctx.errors.add(`${name}: missing in es_pnoa_dir`);
			return 'invalid';
		}
		// The listing rounds to 10 kB, and "MB" may mean 10^6 or 2^20 bytes: allow 1% below 10^6.
		const bytes = statSync(path).size;
		if (bytes < sizeMb * 1e6 * 0.99) {
			ctx.errors.add(`${name}: ${bytes} bytes, but the listing says ${sizeMb} MB; download it again`);
			return 'invalid';
		}
		if (!(await isValidRaster(path))) {
			ctx.errors.add(`${name}: not a readable raster; download it again`);
			return 'invalid';
		}
		return { path };
	},
	convert: async ({ path }, { dest, maxZoom }) => {
		// Sheets along the coast and the border can have a fill around the imagery.
		await runMosaicTile(path, dest, { maxZoom, border: 'mask' });
	},
	priority: flightMonthPriority,
	minFiles: 15000,
});
