/* global agGrid, maplibregl, VersaTilesStyle, rowData */

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
	const list = notes.map((n) => '<li>' + n + '</li>').join('');
	return '<details><summary>' + notes.length + ' notes</summary><ul>' + list + '</ul></details>';
}

const columnDefs = [
	{ field: 'id', headerName: 'ID', width: 160, sort: 'asc', filter: true },
	{ field: 'name', headerName: 'Name', flex: 1, minWidth: 150, filter: true },
	{ field: 'status', headerName: 'Status', width: 110, cellRenderer: StatusCellRenderer, filter: true },
	{ field: 'releaseDate', headerName: 'Released', width: 120, filter: true },
	{ field: 'date', headerName: 'Date', width: 110, filter: true },
	{ field: 'licenseName', headerName: 'License', width: 140, cellRenderer: LinkCellRenderer, filter: true },
	{ field: 'creatorName', headerName: 'Creator', flex: 1, minWidth: 150, cellRenderer: LinkCellRenderer, filter: true },
	{
		field: 'notes',
		headerName: 'Notes',
		minWidth: 200,
		flex: 1,
		cellRenderer: NotesCellRenderer,
		sortable: false,
		autoHeight: true,
		wrapText: true,
	},
];

const gridOptions = {
	columnDefs,
	rowData,
	getRowId: (params) => params.data.id,
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
	domLayout: 'autoHeight',
	animateRows: false,
	suppressCellFocus: true,
};

const gridApi = agGrid.createGrid(document.getElementById('grid'), gridOptions);

// --- Map ---

const style = VersaTilesStyle.colorful({
	baseUrl: 'https://tiles.versatiles.org',
	recolor: { saturate: -0.8 },
});

maplibregl.setRTLTextPlugin('https://tiles.versatiles.org/assets/lib/mapbox-gl-rtl-text/mapbox-gl-rtl-text.js', true);

const map = new maplibregl.Map({
	container: 'map',
	style,
	bounds: [-12, 35, 41, 60],
});

function escapeHtml(s) {
	return String(s).replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
	);
}

map.on('load', async () => {
	let regions;
	try {
		regions = await fetch('status.json').then((r) => r.json());
	} catch (err) {
		console.error('Failed to load status.json for map:', err);
		return;
	}

	const byId = new Map(rowData.map((r) => [r.id, r]));
	const features = [];
	for (const r of regions) {
		if (!r.region || !r.region.geometry) continue;
		const meta = byId.get(r.id);
		if (!meta) continue;
		features.push({
			type: 'Feature',
			id: r.id,
			properties: {
				id: meta.id,
				name: meta.name,
				status: meta.status,
				statusColor: meta.statusColor,
				notesCount: meta.notes ? meta.notes.length : 0,
			},
			geometry: r.region.geometry,
		});
	}

	map.addSource('regions', { type: 'geojson', data: { type: 'FeatureCollection', features } });

	map.addLayer({
		id: 'regions-fill',
		type: 'fill',
		source: 'regions',
		paint: { 'fill-color': ['get', 'statusColor'], 'fill-opacity': 0.45 },
	});
	map.addLayer({
		id: 'regions-hover',
		type: 'fill',
		source: 'regions',
		paint: {
			'fill-color': '#fff',
			'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.25, 0],
		},
	});
	map.addLayer({
		id: 'regions-line',
		type: 'line',
		source: 'regions',
		paint: { 'line-color': '#0d1117', 'line-width': 0.6 },
	});

	const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
	let hoveredId = null;

	map.on('mousemove', 'regions-fill', (e) => {
		if (!e.features.length) return;
		const f = e.features[0];
		if (hoveredId !== null && hoveredId !== f.id) {
			map.setFeatureState({ source: 'regions', id: hoveredId }, { hover: false });
		}
		hoveredId = f.id;
		map.setFeatureState({ source: 'regions', id: hoveredId }, { hover: true });
		map.getCanvas().style.cursor = 'pointer';
		const p = f.properties;
		const noteLine =
			p.notesCount > 0
				? '<div style="color:#8b949e;margin-top:2px">' +
					p.notesCount +
					' note' +
					(p.notesCount === 1 ? '' : 's') +
					'</div>'
				: '';
		popup
			.setLngLat(e.lngLat)
			.setHTML(
				'<div style="font-weight:bold">' +
					escapeHtml(p.name) +
					' <span style="color:#6e7681;font-weight:normal">' +
					escapeHtml(p.id) +
					'</span></div>' +
					'<div style="color:' +
					p.statusColor +
					';font-weight:bold">' +
					escapeHtml(p.status) +
					'</div>' +
					noteLine,
			)
			.addTo(map);
	});

	map.on('mouseleave', 'regions-fill', () => {
		if (hoveredId !== null) {
			map.setFeatureState({ source: 'regions', id: hoveredId }, { hover: false });
			hoveredId = null;
		}
		map.getCanvas().style.cursor = '';
		popup.remove();
	});

	map.on('click', 'regions-fill', (e) => {
		if (!e.features.length) return;
		const id = e.features[0].id;
		const node = gridApi.getRowNode(id);
		if (!node) return;
		gridApi.deselectAll();
		node.setSelected(true);
		gridApi.ensureNodeVisible(node, 'middle');
		gridApi.flashCells({ rowNodes: [node] });
	});
});
