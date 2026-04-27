/**
 * Pure XML helpers for the IGN BD ORTHO® ATOM feed.
 *
 * No I/O, no globals — these functions take XML strings and return structured
 * data, so they're easy to unit-test (see `parsers.test.ts`).
 */

import { createXmlParser } from '../lib.ts';

const xmlParser = createXmlParser();

/** An entry parsed from the main BD ORTHO ATOM feed. */
export interface IndexEntry {
	title: string;
	zone: string; // e.g. 'D075', 'D02A', 'D971'
	version: string; // '1-0' or '2-0'
	bands: string; // e.g. 'RVB-0M20', 'IRC-0M15'
	resolution: string; // '0M15' | '0M20' | '0M50'
	editionDate: string; // 'YYYY-MM-DD'
	detailUrl: string; // ATOM feed URL for the per-resource detail
}

/**
 * Parses one ATOM feed page into structured index entries.
 * Returns only RVB (visible-light) entries; IRC/GRAPHE-MOSAIQUAGE are filtered out.
 */
export function parseIndexPage(xml: string): IndexEntry[] {
	const parsed = xmlParser.parse(xml) as Record<string, unknown>;
	const feed = parsed.feed as Record<string, unknown> | undefined;
	const rawEntries: unknown[] = [feed?.entry ?? []].flat();

	const out: IndexEntry[] = [];
	for (const raw of rawEntries) {
		const entry = raw as Record<string, unknown>;
		const title = typeof entry.title === 'string' ? entry.title : undefined;
		if (!title) continue;

		const parts = title.split('_');
		// Expected: BDORTHO_<version>_<bands>_<format>_<projection>_<zone>_<date>
		if (parts.length !== 7 || parts[0] !== 'BDORTHO') continue;
		const [, version, bands] = parts;
		const bandParts = bands.split('-');
		if (bandParts[0] !== 'RVB') continue; // skip IRC, GRAPHE-MOSAIQUAGE, etc.
		const resolution = bandParts[1];

		const zoneElt = entry['gpf_dl:zone'] as { '@_term'?: string } | undefined;
		const zone = zoneElt?.['@_term'];
		if (!zone) continue;

		const editionDate = entry['gpf_dl:editionDate'];
		if (typeof editionDate !== 'string') continue;

		// <link rel="alternate" type="application/atom+xml" href="…"/> is the detail feed URL.
		const links: unknown[] = [entry.link ?? []].flat();
		let detailUrl: string | undefined;
		for (const l of links) {
			const link = l as { '@_href'?: string; '@_type'?: string; '@_rel'?: string };
			if (link['@_type'] === 'application/atom+xml' && link['@_rel'] === 'alternate') {
				detailUrl = link['@_href'];
				break;
			}
		}
		if (!detailUrl) continue;

		out.push({ title, zone, version, bands, resolution, editionDate, detailUrl });
	}
	return out;
}

/**
 * Picks the best available entry per zone.
 * Order: newer version (2-0 > 1-0), then highest resolution (0M15 > 0M20 > 0M50), then latest editionDate.
 */
export function pickBestPerZone(entries: IndexEntry[]): Map<string, IndexEntry> {
	const best = new Map<string, IndexEntry>();
	const versionRank = (v: string): number => (v === '2-0' ? 2 : 1);
	const resolutionRank = (r: string): number => (r === '0M15' ? 3 : r === '0M20' ? 2 : 1);

	const score = (e: IndexEntry): [number, number, string] => [
		versionRank(e.version),
		resolutionRank(e.resolution),
		e.editionDate,
	];
	const better = (a: IndexEntry, b: IndexEntry): boolean => {
		const [av, ar, ad] = score(a);
		const [bv, br, bd] = score(b);
		if (av !== bv) return av > bv;
		if (ar !== br) return ar > br;
		return ad > bd;
	};

	for (const e of entries) {
		const current = best.get(e.zone);
		if (!current || better(e, current)) best.set(e.zone, e);
	}
	return best;
}

/**
 * Returns the year range spanned by a list of YYYY-MM-DD edition dates,
 * formatted as `'YYYY'` (single year) or `'YYYY-YYYY'` (min-max).
 */
export function computeDateRange(editionDates: string[]): string {
	if (editionDates.length === 0) throw new Error('computeDateRange: no edition dates');
	const years = editionDates.map((d) => d.slice(0, 4));
	const min = years.reduce((a, b) => (a < b ? a : b));
	const max = years.reduce((a, b) => (a > b ? a : b));
	return min === max ? min : `${min}-${max}`;
}

/**
 * Extracts 7z download URLs from a per-resource detail ATOM feed.
 *
 * The detail endpoint paginates with a default page size of 10, so a region
 * with many `.7z.NNN` parts (e.g. fr/guyane: 22 parts) will silently return a
 * truncated list unless the caller fetches it with `?limit=N` set high enough.
 * As a safety net, when the response advertises `gpf_dl:totalentries`, we
 * compare against the parsed entry count and throw if anything is missing.
 */
export function parseDetailFeed(xml: string): string[] {
	const parsed = xmlParser.parse(xml) as Record<string, unknown>;
	const feed = parsed.feed as Record<string, unknown> | undefined;
	const rawEntries: unknown[] = [feed?.entry ?? []].flat();

	const totalRaw = feed?.['@_gpf_dl:totalentries'];
	const total = typeof totalRaw === 'string' || typeof totalRaw === 'number' ? Number(totalRaw) : NaN;
	if (Number.isFinite(total) && rawEntries.length < total) {
		throw new Error(
			`parseDetailFeed: paginated response — got ${rawEntries.length} of ${total} entries. ` +
				`Refetch the detail URL with a higher ?limit=.`,
		);
	}

	const urls: string[] = [];
	for (const raw of rawEntries) {
		const entry = raw as Record<string, unknown>;
		const links: unknown[] = [entry.link ?? []].flat();
		for (const l of links) {
			const link = l as { '@_href'?: string };
			const href = link['@_href'];
			if (!href) continue;
			if (href.endsWith('.7z') || /\.7z\.\d+$/.test(href)) urls.push(href);
		}
	}
	return urls.sort();
}
