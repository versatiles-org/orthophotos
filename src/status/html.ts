import type { RegionMetadata, RegionStatus } from '../lib/framework.ts';
import type { KnownRegion } from './geojson.ts';

const STATUS_LABELS: Record<RegionStatus, string> = {
	released: 'Released',
	scraping: 'Scraping',
	planned: 'Planned',
	blocked: 'Blocked',
};

const STATUS_COLORS: Record<RegionStatus, string> = {
	released: '#2da44e',
	scraping: '#bf8700',
	planned: '#768390',
	blocked: '#cf222e',
};

interface RowData {
	id: string;
	name: string;
	status: string;
	statusColor: string;
	releaseDate: string;
	date: string;
	licenseName: string;
	licenseUrl: string;
	creatorName: string;
	creatorUrl: string;
	notes: string[];
}

export function generateStatusPage(
	allMetadata: Map<string, RegionMetadata>,
	knownRegions: Map<string, KnownRegion>,
): string {
	const counts: Record<RegionStatus, number> = { released: 0, scraping: 0, planned: 0, blocked: 0 };
	const rows: RowData[] = [];

	for (const [id, meta] of allMetadata) {
		counts[meta.status]++;
		const region = knownRegions.get(id);
		rows.push({
			id,
			name: region?.properties.fullname ?? id,
			status: STATUS_LABELS[meta.status],
			statusColor: STATUS_COLORS[meta.status],
			releaseDate: meta.status === 'released' ? meta.releaseDate : '',
			date: meta.date ?? '',
			licenseName: meta.license?.name ?? '',
			licenseUrl: meta.license?.url ?? '',
			creatorName: meta.creator?.name ?? '',
			creatorUrl: meta.creator?.url ?? '',
			notes: meta.notes,
		});
	}

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
<script src="https://cdn.jsdelivr.net/npm/ag-grid-community@33/dist/ag-grid-community.min.js"></script>
<style>
	body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; margin: 0; padding: 20px; background: #0d1117; color: #e6edf3; }
	h1 { margin: 0 0 8px; }
	.summary { margin-bottom: 16px; font-size: 14px; color: #8b949e; }
	a { color: #58a6ff; text-decoration: none; }
	a:hover { text-decoration: underline; }
	details summary { cursor: pointer; }
	details summary:hover { color: #58a6ff; }
	#grid { height: calc(100vh - 80px); }
</style>
</head>
<body>
<h1>VersaTiles Orthophotos</h1>
<p class="summary">${allMetadata.size} regions &middot; ${summary}</p>
<div id="grid"></div>
<script>
const rowData = ${JSON.stringify(rows)};

function StatusCellRenderer(params) {
	if (!params.value) return '';
	const row = params.data;
	return '<span style="color:' + row.statusColor + ';font-weight:bold">' + params.value + '</span>';
}

function LinkCellRenderer(params) {
	if (!params.value) return '';
	const url = params.colDef.field === 'licenseName' ? params.data.licenseUrl : params.data.creatorUrl;
	if (!url) return params.value;
	return '<a href="' + url + '" target="_blank">' + params.value + '</a>';
}

function NotesCellRenderer(params) {
	const notes = params.value;
	if (!notes || notes.length === 0) return '';
	if (notes.length === 1) return '<span>' + notes[0] + '</span>';
	const list = notes.map(n => '<li>' + n + '</li>').join('');
	return '<details><summary>' + notes.length + ' notes</summary><ul style="margin:4px 0;padding-left:18px">' + list + '</ul></details>';
}

const columnDefs = [
	{ field: 'id', headerName: 'ID', width: 160, sort: 'asc', filter: true },
	{ field: 'name', headerName: 'Name', flex: 1, minWidth: 150, filter: true },
	{ field: 'status', headerName: 'Status', width: 110, cellRenderer: StatusCellRenderer, filter: true },
	{ field: 'releaseDate', headerName: 'Released', width: 120, filter: true },
	{ field: 'date', headerName: 'Date', width: 110, filter: true },
	{ field: 'licenseName', headerName: 'License', width: 140, cellRenderer: LinkCellRenderer, filter: true },
	{ field: 'creatorName', headerName: 'Creator', flex: 1, minWidth: 150, cellRenderer: LinkCellRenderer, filter: true },
	{ field: 'notes', headerName: 'Notes', minWidth: 200, flex: 1, cellRenderer: NotesCellRenderer, sortable: false, autoHeight: true, wrapText: true },
];

const gridOptions = {
	columnDefs,
	rowData,
	theme: agGrid.themeQuartz.withParams({
		backgroundColor: '#0d1117',
		foregroundColor: '#e6edf3',
		headerBackgroundColor: '#161b22',
		headerTextColor: '#8b949e',
		borderColor: '#21262d',
		rowHoverColor: '#161b22',
		chromeBackgroundColor: '#161b22',
	}),
	defaultColDef: {
		sortable: true,
		resizable: true,
	},
	domLayout: 'normal',
	animateRows: false,
	suppressCellFocus: true,
};

const gridDiv = document.getElementById('grid');
agGrid.createGrid(gridDiv, gridOptions);
</script>
</body>
</html>
`;
}
