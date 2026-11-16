/**
 * One region per US state from NAIP (USDA Farm Service Agency), read from the copy on Microsoft
 * Planetary Computer: cloud-optimized GeoTIFFs in an Azure container that anyone can list and
 * read, in West Europe, close to the build machine. Each state is fetched, tiled and merged on
 * its own, so a run never holds more than one state, and a failed state is rerun alone.
 */

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
	copyRemoteCog,
	defineTileRegion,
	PATIENT_RETRY,
	type RegionMetadata,
	type RegionPipeline,
	runMosaicTile,
	withRetry,
} from '../../lib/index.ts';

/** The Azure container of NAIP on Planetary Computer, which allows anonymous listing and reads. */
export const NAIP_CONTAINER = 'https://naipeuwest.blob.core.windows.net/naip';

export interface UsStateOptions {
	/** Region ID, e.g. `us/new_york`. */
	name: string;
	/** Two-letter state code, as in the container's paths (`v002/<code>/<year>/`). */
	code: string;
	/** The NAIP year to use: the newest complete one when last checked. */
	year: number;
	/** Ground pixel size of that year in centimetres: 30 or 60. */
	resolution: 30 | 60;
	/** Lower bound for the number of files, a little below the count when last checked. */
	minFiles: number;
}

export interface NaipFile {
	id: string;
	url: string;
}

/** The `.tif` files and the continuation marker of one page of an Azure container listing. */
export function parseBlobList(xml: string): { names: string[]; nextMarker: string | null } {
	const names = [...xml.matchAll(/<Name>([^<]+\.tif)<\/Name>/g)].map((m) => m[1]);
	const marker = xml.match(/<NextMarker>([^<]+)<\/NextMarker>/);
	return { names, nextMarker: marker ? marker[1] : null };
}

/** The item for one blob path, e.g. `v002/de/2023/de_030cm_2023/38075/m_3807535_nw_18_030_20230819_20230919.tif`. */
export function naipFile(path: string): NaipFile {
	const id = path.replace(/^.*\//, '').replace(/\.tif$/, '');
	return { id, url: `${NAIP_CONTAINER}/${path}` };
}

/** Lists every GeoTIFF of one state and year, page by page. */
async function listNaipFiles(code: string, year: number, cacheDir: string): Promise<NaipFile[]> {
	const files: NaipFile[] = [];
	let marker: string | null = null;
	let page = 0;
	do {
		const pagePath = join(cacheDir, `listing_${page}.xml`);
		let xml: string;
		if (existsSync(pagePath)) {
			xml = await readFile(pagePath, 'utf-8');
		} else {
			const query = new URLSearchParams({ restype: 'container', comp: 'list', prefix: `v002/${code}/${year}/` });
			if (marker) query.set('marker', marker);
			xml = await withRetry(async () => {
				const res = await fetch(`${NAIP_CONTAINER}?${query}`);
				if (!res.ok) throw new Error(`Listing NAIP ${code} ${year} failed: ${res.status} ${res.statusText}`);
				return res.text();
			}, PATIENT_RETRY);
			await writeFile(pagePath, xml);
		}
		const parsed = parseBlobList(xml);
		files.push(...parsed.names.map(naipFile));
		marker = parsed.nextMarker;
		page++;
	} while (marker);
	return files;
}

function buildMeta(opts: UsStateOptions): RegionMetadata {
	return {
		status: 'scraping',
		notes: [
			'NAIP (National Agriculture Imagery Program), flown per state every two to three years in the growing season.',
			'Read from the copy on Microsoft Planetary Computer, an Azure container that allows anonymous listing and reads.',
			'Cloud-optimized GeoTIFFs with a near-infrared band, which is left out; 30 cm files are read at their 60 cm overview, enough for zoom 17.',
			'Public domain; the files ask for the credit "NAIP imagery provided by USDA Farm Service Agency".',
		],
		entries: ['result'],
		license: {
			name: 'Public domain',
			url: 'https://www.fsa.usda.gov/programs-and-services/aerial-photography/imagery-programs/naip-imagery/',
			requiresAttribution: true,
		},
		creator: {
			name: 'USDA Farm Service Agency',
			url: 'https://planetarycomputer.microsoft.com/dataset/naip',
		},
		date: String(opts.year),
		resolution: opts.resolution,
		checked: '2026-11-16',
		aggregateUnder: 'us',
	};
}

/** The region for one state. */
export function defineUsState(opts: UsStateOptions): RegionPipeline {
	// Zoom 17 is 0.45–0.52 m on the ground in the lower 48: the 60 cm overview of a 30 cm file
	// fills it almost, and the full 30 cm would read four times the data for little more.
	const overview = opts.resolution === 30 ? 0 : undefined;
	return defineTileRegion({
		name: opts.name,
		meta: buildMeta(opts),
		init: async (ctx) => {
			console.log(`  Listing NAIP ${opts.code} ${opts.year}...`);
			return listNaipFiles(opts.code, opts.year, ctx.tempDir);
		},
		download: async ({ id, url }, ctx) => {
			const tifPath = ctx.tempFile(join(ctx.tempDir, `${id}.tif`));
			await withRetry(() => copyRemoteCog(url, tifPath, { bands: [1, 2, 3], overview }), PATIENT_RETRY);
			return { tifPath };
		},
		convert: async ({ tifPath }, { dest, maxZoom }) => {
			// Quarter quads at the state border and the coast can have black fill.
			await runMosaicTile(tifPath, dest, { maxZoom, border: 'mask' });
		},
		minFiles: opts.minFiles,
	});
}
