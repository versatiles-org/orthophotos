import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import type { RegionMetadata, RegionStatus } from '../lib/index.ts';
import type { KnownRegion } from './geojson.ts';
import type { RegionStats } from './stats.ts';

const STATUS_LABELS: Record<RegionStatus, string> = {
	released: 'Released',
	scraping: 'Scraping',
	planned: 'Planned',
	blocked: 'Blocked',
};

const STATUS_COLORS: Record<RegionStatus, string> = {
	released: '#14b83d', // hsl(135, 80%, 40%)
	scraping: '#1481b8', // hsl(200, 80%, 40%)
	planned: '#5c6670', // hsl(210, 10%, 40%)
	blocked: '#b86614', // hsl( 30, 80%, 40%)
};

interface RowData {
	id: string;
	name: string;
	status: string;
	statusColor: string;
	releaseDate: string;
	date: string;
	resolution: string;
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
}

interface MapFeatureProperties {
	id: string;
	name: string;
	status: string;
	statusColor: string;
	notesCount: number;
}

export function generateStatusPage(
	allMetadata: Map<string, RegionMetadata>,
	knownRegions: Map<string, KnownRegion>,
	stats: Map<string, RegionStats> = new Map(),
): string {
	const counts: Record<RegionStatus, number> = { released: 0, scraping: 0, planned: 0, blocked: 0 };
	const rows: RowData[] = [];
	const features: Feature<Polygon | MultiPolygon, MapFeatureProperties>[] = [];

	for (const [id, meta] of allMetadata) {
		counts[meta.status]++;
		const region = knownRegions.get(id);
		const name = region?.properties.fullname ?? id;
		const status = STATUS_LABELS[meta.status];
		const statusColor = STATUS_COLORS[meta.status];
		const stat = stats.get(id);
		rows.push({
			id,
			name,
			status,
			statusColor,
			releaseDate: meta.status === 'released' ? meta.releaseDate : '',
			date: meta.date ?? '',
			resolution: meta.resolution !== undefined ? `${meta.resolution} cm` : '',
			checked: meta.checked ?? '',
			licenseName: meta.license?.name ?? '',
			licenseUrl: meta.license?.url ?? '',
			creatorName: meta.creator?.name ?? '',
			creatorUrl: meta.creator?.url ?? '',
			notes: meta.notes,
			kbPerTile: stat ? Math.round(stat.size / stat.tiles / 100) / 10 : null,
			kbPerKm2: stat ? Math.round(stat.size / stat.areaKm2 / 1000) : null,
		});
		if (region?.geometry) {
			// MapLibre's `feature-state` requires integer feature IDs — non-numeric strings
			// like "de/bayern" silently no-op. Assign a sequential int here and keep the
			// real region id inside `properties.id` for downstream grid lookups.
			features.push({
				type: 'Feature',
				id: features.length,
				properties: { id, name, status, statusColor, notesCount: meta.notes.length },
				geometry: region.geometry,
			});
		}
	}

	const featureCollection: FeatureCollection<Polygon | MultiPolygon, MapFeatureProperties> = {
		type: 'FeatureCollection',
		features,
	};

	const statuses: RegionStatus[] = ['released', 'scraping', 'planned', 'blocked'];
	const summary = statuses
		.filter((s) => counts[s] > 0)
		.map((s) => `<span style="color:${STATUS_COLORS[s]};font-weight:bold">${counts[s]} ${STATUS_LABELS[s]}</span>`)
		.join(' &middot; ');

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VersaTiles Orthophotos - Status</title>
<link rel="icon" type="image/png" href="https://tiles.versatiles.org/assets/images/versatiles-logo.png">
<script src="https://cdn.jsdelivr.net/npm/ag-grid-community@33/dist/ag-grid-community.min.js"></script>
<script src="https://tiles.versatiles.org/assets/lib/maplibre-gl/maplibre-gl.js"></script>
<link rel="stylesheet" href="https://tiles.versatiles.org/assets/lib/maplibre-gl/maplibre-gl.css" />
<link rel="stylesheet" href="index.css" />
</head>
<body>
<h1>VersaTiles Orthophotos</h1>
<p class="summary">${allMetadata.size} regions &middot; ${summary}</p>
<div id="map"></div>
<div id="grid"></div>
<script>
const rowData = ${JSON.stringify(rows)};
const regionFeatures = ${JSON.stringify(featureCollection)};
</script>
<script src="index.js"></script>
</body>
</html>
`;
}
