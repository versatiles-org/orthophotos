import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { defineTileRegion, downloadFile, downloadRaster, runMosaicTile, withRetry } from '../lib/index.ts';

/**
 * GUGiK's WFS index of the orthophoto map: one layer per year (`gugik:SkorowidzOrtofomapy<year>`),
 * one feature per map sheet and flight, with a direct GeoTIFF link. The Atom feed we used before
 * stops at 2021.
 */
const WFS_URL = 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WFS/Skorowidze';
const FIELDS = 'godlo,akt_data,piksel,kolor,czy_ark_wypelniony,url_do_pobrania';
const PAGE_SIZE = 10000;

/** Oldest year to read. Older sheets are only used where nothing newer covers them. */
const MIN_YEAR = 2020;

/**
 * Only the national coverage, flown at 25 cm. The index also lists city flights at 3–10 cm on
 * smaller sheets: about 45,000 files and 14 TB, against 2.6 TB for the whole country at 25 cm
 * (November 2026), so they're left out.
 */
const MIN_PIXEL_SIZE = 0.2;

export interface IndexEntry {
	/** Map sheet, e.g. `N-33-58-A-c-1-3`. */
	sheet: string;
	/** Flight date, `YYYY-MM-DD`. */
	date: string;
	pixelSize: number;
	/** `RGB` or `CIR`. */
	color: string;
	/** Whether the image covers its whole sheet. */
	complete: boolean;
	url: string;
}

/** The years with an index layer, from the WFS capabilities. */
export function parseIndexYears(capabilitiesXml: string): number[] {
	const years = [...capabilitiesXml.matchAll(/<(?:wfs:)?Name>gugik:SkorowidzOrtofomapy(\d{4})<\/(?:wfs:)?Name>/g)];
	return [...new Set(years.map((m) => Number(m[1])))].sort((a, b) => a - b);
}

/** The features on one page of a GetFeature answer. */
export function parseIndexPage(xml: string): IndexEntry[] {
	const entries: IndexEntry[] = [];
	for (const [feature] of xml.matchAll(/<gugik:SkorowidzOrtofomapy\d{4} [\s\S]*?<\/gugik:SkorowidzOrtofomapy\d{4}>/g)) {
		const field = (name: string): string => feature.match(new RegExp(`<gugik:${name}>([^<]*)<`))?.[1] ?? '';
		const date = feature.match(/<gugik:akt_data[^>]*>\s*<gml:timePosition>([^<]+)</)?.[1] ?? '';
		entries.push({
			sheet: field('godlo'),
			date,
			pixelSize: Number(field('piksel')),
			color: field('kolor'),
			complete: field('czy_ark_wypelniony') === 'TAK',
			url: field('url_do_pobrania'),
		});
	}
	return entries;
}

/**
 * The files to build Poland from: per map sheet, the newest 25 cm RGB image, plus older ones
 * underneath until one covers the whole sheet. The item ID starts with the flight date, so
 * `priority` can draw newer images on top.
 */
export function selectSheets(entries: IndexEntry[]): { id: string; url: string }[] {
	const bySheet = new Map<string, IndexEntry[]>();
	for (const entry of entries) {
		if (entry.color !== 'RGB' || !(entry.pixelSize >= MIN_PIXEL_SIZE) || !entry.url || !entry.date) continue;
		const list = bySheet.get(entry.sheet) ?? [];
		list.push(entry);
		bySheet.set(entry.sheet, list);
	}
	const items: { id: string; url: string }[] = [];
	for (const list of bySheet.values()) {
		list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
		for (const entry of list) {
			items.push({ id: `${entry.date.replaceAll('-', '')}_${basename(entry.url, '.tif')}`, url: entry.url });
			if (entry.complete) break;
		}
	}
	return items;
}

/** The flight date at the start of an item ID, as a number: newer images rank higher. */
export function flightDatePriority(id: string): number {
	if (!/^\d{8}_/.test(id)) throw new Error(`Unexpected Polish tile ID: ${id}`);
	return Number(id.slice(0, 8));
}

export default defineTileRegion({
	name: 'pl',
	meta: {
		status: 'scraping',
		notes: [
			'No access restrictions.',
			'A WFS index per year lists every map sheet with a direct GeoTIFF link; we use the national 25 cm coverage.',
		],
		entries: ['result'],
		license: {
			name: 'CC0',
			url: 'https://creativecommons.org/publicdomain/zero/1.0/',
			requiresAttribution: false,
		},
		creator: {
			name: 'Główny Urząd Geodezji i Kartografii',
			url: 'https://www.geoportal.gov.pl/en/data/orthophotomap-orto/',
		},
		date: `${MIN_YEAR}-2025`,
		resolution: 25,
		checked: '2026-11-12',
	},
	init: async (ctx) => {
		const capsPath = join(ctx.tempDir, 'wfs_capabilities.xml');
		if (!existsSync(capsPath)) {
			await withRetry(() => downloadFile(`${WFS_URL}?service=WFS&request=GetCapabilities`, capsPath), {
				maxAttempts: 3,
			});
		}
		const years = parseIndexYears(await readFile(capsPath, 'utf-8')).filter((year) => year >= MIN_YEAR);
		console.log(`  Index years: ${years.join(', ')}`);

		const entries: IndexEntry[] = [];
		for (const year of years) {
			let count = 0;
			for (let start = 0; ; start += PAGE_SIZE) {
				const pagePath = join(ctx.tempDir, `wfs_${year}_${start}.xml`);
				// Without a sort order the server's pages overlap: some features come twice and as many
				// are missing (about 2,000 of 60,000 for 2021).
				const url =
					`${WFS_URL}?service=WFS&version=2.0.0&request=GetFeature&typeNames=gugik:SkorowidzOrtofomapy${year}` +
					`&propertyName=${FIELDS}&sortBy=url_do_pobrania&count=${PAGE_SIZE}&startIndex=${start}`;
				// The server sometimes resets the connection; retry generously.
				if (!existsSync(pagePath)) await withRetry(() => downloadFile(url, pagePath), { maxAttempts: 5 });
				const page = parseIndexPage(await readFile(pagePath, 'utf-8'));
				entries.push(...page);
				count += page.length;
				if (page.length < PAGE_SIZE) break;
			}
			console.log(`  ${year}: ${count} index entries`);
		}

		const items = selectSheets(entries);
		console.log(`  Selected ${items.length} GeoTIFFs`);
		return items;
	},
	downloadLimit: 2,
	download: async ({ url, id }, ctx) => {
		const tifPath = ctx.tempFile(join(ctx.tempDir, `${id}.tif`));
		const result = await downloadRaster(url, tifPath, ctx.errors, `${id}.tif`, {
			retry: { maxAttempts: 5, initialDelayMs: 3000 },
		});
		if (result === 'invalid') return 'invalid';
		return { tifPath };
	},
	convert: async ({ tifPath }, { dest, maxZoom }) => {
		await runMosaicTile(tifPath, dest, { maxZoom });
	},
	// Newer flights are drawn over older ones on sheets that only partly cover their area.
	priority: flightDatePriority,
	// 64,603 GeoTIFFs for 64,266 sheets in November 2026.
	minFiles: 60000,
});
