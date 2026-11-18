import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { RegionMetadata } from '../lib/index.ts';
import { combinedStatus, currentStatus, type DisplayStatus } from './current.ts';
import type { KnownRegion } from './geojson.ts';
import { aggregateStats, type RegionStatsListing } from './stats.ts';

/** In the order of the summary and of the status filter. */
const STATUSES: DisplayStatus[] = ['released', 'outdated', 'scraping', 'planned', 'blocked'];

const STATUS_LABELS: Record<DisplayStatus, string> = {
	released: 'Released',
	outdated: 'Outdated',
	scraping: 'Scraping',
	planned: 'Planned',
	blocked: 'Blocked',
};

const STATUS_COLORS: Record<DisplayStatus, string> = {
	released: '#14b83d', // hsl(135, 80%, 40%)
	outdated: '#7d8f24', // hsl( 70, 60%, 35%)
	scraping: '#1481b8', // hsl(200, 80%, 40%)
	planned: '#5c6670', // hsl(210, 10%, 40%)
	blocked: '#b86614', // hsl( 30, 80%, 40%)
};

/** A region file on the storage box: `date` is its upload date, `null` in listings without dates. */
interface FileData {
	date: string | null;
	/** File size in bytes. */
	size: number;
}

/** One of the regions a row stands for (`aggregateUnder`), e.g. a French région. */
interface PartData {
	id: string;
	name: string;
	status: string;
	statusColor: string;
	releaseDate: string;
	/** The file on the storage box, `null` if it isn't there or there is no listing. */
	file: FileData | null;
}

interface RowData {
	id: string;
	name: string;
	status: string;
	statusColor: string;
	releaseDate: string;
	/** The file on the storage box, `null` if it isn't there, for rows that stand for parts, or without a listing. */
	file: FileData | null;
	/** The regions the row stands for; empty for a plain region. */
	parts: PartData[];
	date: string;
	/** Source resolution in cm, `null` if unknown. */
	resolution: number | null;
	checked: string;
	licenseName: string;
	licenseUrl: string;
	creatorName: string;
	creatorUrl: string;
	notes: string[];
	/** File size per tile in KB, `null` without stats. */
	kbPerTile: number | null;
	/** File size per km² of the top zoom's tiles in KB, `null` without stats. */
	kbPerKm2: number | null;
	/** `[west, south, east, north]` of the region's outline, for zooming the map to it; `null` without one. */
	bbox: [number, number, number, number] | null;
}

interface MapFeatureProperties {
	/** ID of the row, which a click on the feature selects. */
	id: string;
	/** ID of the part the feature outlines, if the row's parts are drawn one by one. */
	part?: string;
	name: string;
	status: string;
	statusColor: string;
	notesCount: number;
}

export interface StatusPageOptions {
	/** Every region in the code, including the parts that rows stand for (`aggregateUnder`). Defaults to the rows. */
	regions?: Map<string, RegionMetadata>;
	/** The last listing of the storage box. Without it, the page shows the statuses in the code. */
	listing?: RegionStatsListing;
}

/**
 * @param allMetadata - One entry per row, with the parts of `aggregateUnder` already combined
 *   (`getAggregatedRegionMetadata()`).
 */
export function generateStatusPage(
	allMetadata: Map<string, RegionMetadata>,
	knownRegions: Map<string, KnownRegion>,
	options: StatusPageOptions = {},
): string {
	const regions = options.regions ?? allMetadata;
	const files = options.listing?.regions;
	const stats = files ? aggregateStats(files, regions) : new Map();
	const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<DisplayStatus, number>;
	const rows: RowData[] = [];
	const features: Feature<Polygon | MultiPolygon, MapFeatureProperties>[] = [];

	/** The file of a region, its status, and the date it was released or, if only its file is new, uploaded. */
	function regionState(id: string, meta: RegionMetadata) {
		const stat = files?.get(id);
		const file: FileData | null = stat ? { date: stat.date ?? null, size: stat.size } : null;
		const statusKey = currentStatus(meta.status, files ? files.has(id) : undefined);
		const releaseDate =
			meta.status === 'released' ? meta.releaseDate : statusKey === 'released' ? (file?.date ?? '') : '';
		return { file, statusKey, releaseDate };
	}

	for (const [id, meta] of allMetadata) {
		const region = knownRegions.get(id);
		const name = region?.properties.fullname ?? id;
		const parts: (PartData & { statusKey: DisplayStatus })[] = [...regions]
			.filter(([, m]) => m.aggregateUnder === id)
			.map(([partId, partMeta]) => {
				const { file, statusKey, releaseDate } = regionState(partId, partMeta);
				const partName = knownRegions.get(partId)?.properties.fullname ?? nameFromId(partId);
				return {
					id: partId,
					name: partName,
					status: STATUS_LABELS[statusKey],
					statusColor: STATUS_COLORS[statusKey],
					releaseDate,
					file,
					statusKey,
				};
			})
			.sort((a, b) => a.id.localeCompare(b.id));
		const own = regionState(id, meta);
		// A row whose parts all have an outline is drawn and framed by its parts.
		const partOutlines = parts.map((p) => knownRegions.get(p.id)?.geometry);
		const drawParts = parts.length > 0 && partOutlines.every(Boolean);
		const outline: Polygon | MultiPolygon | undefined = drawParts
			? {
					type: 'MultiPolygon',
					coordinates: partOutlines.flatMap((g) => (g!.type === 'Polygon' ? [g!.coordinates] : g!.coordinates)),
				}
			: region?.geometry;
		const statusKey = parts.length ? combinedStatus(parts.map((p) => p.statusKey)) : own.statusKey;
		counts[statusKey]++;
		const status = STATUS_LABELS[statusKey];
		const statusColor = STATUS_COLORS[statusKey];
		const stat = stats.get(id);
		rows.push({
			id,
			name,
			status,
			statusColor,
			releaseDate: parts.length
				? parts.reduce((max, p) => (p.releaseDate > max ? p.releaseDate : max), '')
				: own.releaseDate,
			file: parts.length ? null : own.file,
			parts: parts.map(({ statusKey: _, ...part }) => part),
			date: meta.date ?? '',
			resolution: meta.resolution ?? null,
			checked: meta.checked ?? '',
			licenseName: meta.license?.name ?? '',
			licenseUrl: meta.license?.url ?? '',
			creatorName: meta.creator?.name ?? '',
			creatorUrl: meta.creator?.url ?? '',
			notes: meta.notes,
			kbPerTile: stat ? Math.round(stat.size / stat.tiles / 100) / 10 : null,
			kbPerKm2: stat ? Math.round(stat.size / stat.areaKm2 / 1000) : null,
			bbox: outline ? geometryBbox(outline) : null,
		});
		// MapLibre's `feature-state` requires integer feature IDs — non-numeric strings
		// like "de/bayern" silently no-op. Assign a sequential int here and keep the
		// real region id inside `properties.id` for the table.
		const notesCount = meta.notes.length;
		if (drawParts) {
			// Each part in its own status, so the progress of a release run shows on the map.
			parts.forEach((p, i) => {
				const properties = { id, part: p.id, name: p.name, status: p.status, statusColor: p.statusColor, notesCount };
				features.push({ type: 'Feature', id: features.length, properties, geometry: partOutlines[i]! });
			});
		} else if (region?.geometry) {
			features.push({
				type: 'Feature',
				id: features.length,
				properties: { id, name, status, statusColor, notesCount },
				geometry: region.geometry,
			});
		}
	}

	const featureCollection: FeatureCollection<Polygon | MultiPolygon, MapFeatureProperties> = {
		type: 'FeatureCollection',
		features,
	};

	const summary = STATUSES.filter((s) => counts[s] > 0)
		.map((s) => `<span style="color:${STATUS_COLORS[s]};font-weight:bold">${counts[s]} ${STATUS_LABELS[s]}</span>`)
		.join(' &middot; ');
	const listingDate = options.listing
		? ` &middot; <span title="Date of the last listing of the storage box (npm run build:stats)">files as of ${options.listing.generated}</span>`
		: '';

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VersaTiles Orthophotos - Status</title>
<link rel="icon" type="image/png" href="https://tiles.versatiles.org/assets/images/versatiles-logo.png">
<script src="https://tiles.versatiles.org/assets/lib/maplibre-gl/maplibre-gl.js"></script>
<link rel="stylesheet" href="https://tiles.versatiles.org/assets/lib/maplibre-gl/maplibre-gl.css" />
<link rel="stylesheet" href="index.css" />
</head>
<body>
<header>
<h1>VersaTiles Orthophotos</h1>
<p class="summary">${allMetadata.size} regions &middot; ${summary}${listingDate}</p>
</header>
<div id="map"></div>
<div id="regions"></div>
<script>
const rowData = ${scriptJson(rows)};
const regionFeatures = ${scriptJson(featureCollection)};
const filesListedOn = ${scriptJson(options.listing?.generated ?? null)};
</script>
<script src="index.js"></script>
</body>
</html>
`;
}

/** `[west, south, east, north]` of a polygon or multipolygon, rounded to 0.001°. */
export function geometryBbox(geometry: Polygon | MultiPolygon): [number, number, number, number] {
	const rings = geometry.type === 'Polygon' ? geometry.coordinates : geometry.coordinates.flat();
	let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
	for (const ring of rings) {
		for (const [x, y] of ring) {
			west = Math.min(west, x);
			south = Math.min(south, y);
			east = Math.max(east, x);
			north = Math.max(north, y);
		}
	}
	const round = (v: number) => Math.round(v * 1000) / 1000;
	return [round(west), round(south), round(east), round(north)];
}

/** A readable name from a region ID without a known outline: `us/new_york` → `New York`. */
function nameFromId(id: string): string {
	return id
		.replace(/^.*\//, '')
		.split('_')
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}

/** JSON for an inline `<script>`: `<` is escaped, so no text in the data can end the script. */
function scriptJson(value: unknown): string {
	return JSON.stringify(value).replaceAll('<', '\\u003c');
}
