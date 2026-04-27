/**
 * Pure helpers for the IGN BD ORTHO® feed.
 *
 * Both endpoints (index + per-resource detail) are consumed as JSON via
 * `Accept: application/json`. Functions here take already-parsed objects and
 * return structured data — no I/O, easy to unit-test.
 */

/** Normalised entry derived from the BD ORTHO index page. */
export interface IndexEntry {
	title: string;
	zone: string; // e.g. 'D075', 'D02A', 'D971'
	version: string; // '1-0' or '2-0'
	bands: string; // e.g. 'RVB-0M20', 'IRC-0M15'
	resolution: string; // '0M15' | '0M20' | '0M50'
	editionDate: string; // 'YYYY-MM-DD'
	detailUrl: string; // ATOM feed URL for the per-resource detail
}

/** Shape of one page of the BD ORTHO index, as returned with `Accept: application/json`. */
export interface BdorthoIndexPage {
	pagecount?: number;
	totalentries?: number;
	entry?: BdorthoIndexEntryRaw[];
}

interface BdorthoIndexEntryRaw {
	title?: string;
	editionDate?: string;
	zone?: { term?: string }[];
	link?: { href?: string; type?: string; rel?: string }[];
}

/**
 * Parses one JSON index page into structured entries.
 * Returns only RVB (visible-light) entries; IRC/GRAPHE-MOSAIQUAGE are filtered out.
 */
export function parseIndexPage(body: BdorthoIndexPage): IndexEntry[] {
	const out: IndexEntry[] = [];
	for (const entry of body.entry ?? []) {
		const { title, editionDate } = entry;
		if (!title || !editionDate) continue;

		const parts = title.split('_');
		// Expected: BDORTHO_<version>_<bands>_<format>_<projection>_<zone>_<date>
		if (parts.length !== 7 || parts[0] !== 'BDORTHO') continue;
		const [, version, bands] = parts;
		const bandParts = bands.split('-');
		if (bandParts[0] !== 'RVB') continue; // skip IRC, GRAPHE-MOSAIQUAGE, etc.
		const resolution = bandParts[1];

		const zone = entry.zone?.[0]?.term;
		if (!zone) continue;

		const detailUrl = entry.link?.find((l) => l.type === 'application/atom+xml' && l.rel === 'alternate')?.href;
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

/** A 7z archive part to download, with its byte length from the JSON feed. */
export interface BdorthoDetailPart {
	url: string;
	/** Bytes; 0 if the feed didn't report it. Pipe through `downloadFiles({size})` to skip HEAD probes. */
	length: number;
}

/** Shape of a per-resource detail feed, as returned with `Accept: application/json`. */
export interface BdorthoDetailFeed {
	totalentries?: number;
	entry?: BdorthoDetailEntryRaw[];
}

interface BdorthoDetailEntryRaw {
	link?: { href?: string; type?: string; length?: number }[];
}

/**
 * Extracts 7z download URLs (with byte lengths) from a per-resource JSON detail feed.
 *
 * The detail endpoint paginates with a default page size of 10, so a region
 * with many `.7z.NNN` parts (e.g. fr/guyane: 22 parts) will silently return a
 * truncated list unless the caller fetches it with `?limit=N` set high enough.
 * As a safety net, when the response advertises `totalentries`, we compare
 * against the parsed entry count and throw if anything is missing.
 */
export function parseDetailFeed(body: BdorthoDetailFeed): BdorthoDetailPart[] {
	const entries = body.entry ?? [];
	if (typeof body.totalentries === 'number' && entries.length < body.totalentries) {
		throw new Error(
			`parseDetailFeed: paginated response — got ${entries.length} of ${body.totalentries} entries. ` +
				`Refetch the detail URL with a higher ?limit=.`,
		);
	}

	const out: BdorthoDetailPart[] = [];
	for (const entry of entries) {
		for (const link of entry.link ?? []) {
			const href = link.href;
			if (!href) continue;
			if (href.endsWith('.7z') || /\.7z\.\d+$/.test(href)) {
				out.push({ url: href, length: link.length ?? 0 });
			}
		}
	}
	return out.sort((a, b) => a.url.localeCompare(b.url));
}
