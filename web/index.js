/* global maplibregl, rowData, regionFeatures */

// --- Helpers ---

function escapeHtml(s) {
	return String(s).replace(
		/[&<>"']/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
	);
}

/** A note as HTML: escaped, with `code` and links. */
function formatNote(note) {
	return escapeHtml(note)
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/https?:\/\/[^\s<]+[^\s<.,;:)'"]/g, (url) => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);
}

function link(text, url) {
	if (!text) return '';
	if (!url) return escapeHtml(text);
	return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`;
}

const STATUS_ORDER = ['Released', 'Scraping', 'Planned', 'Blocked'];

// --- Columns ---

/**
 * `value` is what the column sorts by, `text` what its filter searches (defaults to `value`),
 * `html` what the cell shows (defaults to the escaped `text`). Numeric columns accept filters such
 * as `>5` or `<=20`.
 */
const COLUMNS = [
	{
		key: 'status',
		label: 'Status',
		value: (r) => STATUS_ORDER.indexOf(r.status),
		text: (r) => r.status,
		html: (r) => `<span class="status" style="--status:${r.statusColor}">${escapeHtml(r.status)}</span>`,
		options: STATUS_ORDER.filter((s) => rowData.some((r) => r.status === s)),
	},
	{ key: 'id', label: 'ID', value: (r) => r.id, html: (r) => `<code>${escapeHtml(r.id)}</code>` },
	{ key: 'name', label: 'Name', value: (r) => r.name, wrap: true },
	{ key: 'date', label: 'Imagery', value: (r) => r.date, title: 'Years the imagery was flown' },
	{
		key: 'resolution',
		label: 'Resolution',
		numeric: true,
		value: (r) => r.resolution,
		text: (r) => (r.resolution == null ? '' : `${r.resolution} cm`),
		title: 'Ground resolution of the source imagery',
	},
	{ key: 'releaseDate', label: 'Released', value: (r) => r.releaseDate },
	{ key: 'checked', label: 'Checked', value: (r) => r.checked, title: 'Last check of the source for newer data' },
	{
		key: 'kbPerTile',
		label: 'KB/tile',
		numeric: true,
		value: (r) => r.kbPerTile,
		text: (r) => (r.kbPerTile == null ? '' : r.kbPerTile.toFixed(1)),
		title: 'File size divided by the number of tiles over all zoom levels',
	},
	{
		key: 'kbPerKm2',
		label: 'KB/km²',
		numeric: true,
		value: (r) => r.kbPerKm2,
		text: (r) => (r.kbPerKm2 == null ? '' : r.kbPerKm2.toLocaleString('en-US')),
		title: 'File size divided by the ground area of the tiles at the top zoom level',
	},
	{
		key: 'licenseName',
		label: 'License',
		value: (r) => r.licenseName,
		html: (r) => link(r.licenseName, r.licenseUrl),
		wrap: true,
	},
	{
		key: 'creatorName',
		label: 'Creator',
		value: (r) => r.creatorName,
		html: (r) => link(r.creatorName, r.creatorUrl),
		wrap: true,
		wide: true,
	},
	{
		key: 'notes',
		label: 'Notes',
		numeric: true,
		value: (r) => r.notes.length,
		text: (r) => r.notes.join('\n'),
		html: (r) => (r.notes.length ? `<span class="note-count">${r.notes.length}</span>` : ''),
		title: 'Number of notes; the filter searches their text. Click a row to read them.',
	},
];

const textOf = (col, row) => String((col.text ?? col.value)(row) ?? '');

/** CSS classes of a column's cells. Only the columns marked `wrap` break their text into lines. */
const classOf = (col) => [col.numeric && 'num', col.wide && 'wide', col.wrap && 'wrap'].filter(Boolean).join(' ');

// --- State ---

const state = {
	sortKey: 'id',
	sortDir: 1,
	filters: Object.fromEntries(COLUMNS.map((c) => [c.key, ''])),
	selected: null,
};

/** A filter of a numeric column: `>5`, `<=20`, `=0`, or a plain number for equality. */
function numericTest(filter) {
	const m = filter.match(/^\s*(<=|>=|<|>|=)?\s*(-?\d+(?:\.\d+)?)\s*$/);
	if (!m) return null;
	const n = Number(m[2]);
	const op = m[1] ?? '=';
	return (v) => v != null && { '<': v < n, '<=': v <= n, '>': v > n, '>=': v >= n, '=': v === n }[op];
}

function matches(row) {
	return COLUMNS.every((col) => {
		const filter = state.filters[col.key].trim();
		if (!filter) return true;
		if (col.options) return col.text(row) === filter;
		if (col.numeric) {
			const test = numericTest(filter);
			if (test) return test(col.value(row));
		}
		return textOf(col, row).toLowerCase().includes(filter.toLowerCase());
	});
}

function compare(a, b) {
	const col = COLUMNS.find((c) => c.key === state.sortKey);
	const va = col.value(a);
	const vb = col.value(b);
	// Empty values go last in both directions.
	const ea = va == null || va === '';
	const eb = vb == null || vb === '';
	if (ea || eb) return ea === eb ? a.id.localeCompare(b.id) : ea ? 1 : -1;
	const d = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
	return d * state.sortDir || a.id.localeCompare(b.id);
}

// --- Table ---

const container = document.getElementById('regions');
container.innerHTML = `
<div class="toolbar">
	<span class="count"></span>
	<button type="button" class="clear" hidden>Clear filters</button>
</div>
<div class="table-wrap">
	<table>
		<thead>
			<tr class="labels">${COLUMNS.map(
				(c) => `<th data-key="${c.key}" class="${classOf(c)}" aria-sort="none">
					<button type="button" title="${escapeHtml(c.title ?? 'Sort by ' + c.label)}">${c.label}<span class="arrow"></span></button>
				</th>`,
			).join('')}</tr>
			<tr class="filters">${COLUMNS.map((c) => {
				const label = `aria-label="Filter ${escapeHtml(c.label)}"`;
				if (c.options) {
					return `<th><select data-key="${c.key}" ${label}><option value="">All</option>${c.options
						.map((o) => `<option>${escapeHtml(o)}</option>`)
						.join('')}</select></th>`;
				}
				const placeholder = c.numeric ? '>0' : 'Filter';
				return `<th><input type="search" data-key="${c.key}" placeholder="${placeholder}" ${label}></th>`;
			}).join('')}</tr>
		</thead>
		<tbody></tbody>
	</table>
</div>`;

const tbody = container.querySelector('tbody');
const countEl = container.querySelector('.count');
const clearButton = container.querySelector('.clear');

function detailHtml(row) {
	const notes = row.notes.length
		? `<ul class="notes">${row.notes.map((n) => `<li>${formatNote(n)}</li>`).join('')}</ul>`
		: '<p class="muted">No notes.</p>';
	const facts = [
		['License', link(row.licenseName, row.licenseUrl)],
		['Creator', link(row.creatorName, row.creatorUrl)],
	]
		.filter(([, v]) => v)
		.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`)
		.join('');
	const mapLink = row.bbox ? `<a href="#${escapeHtml(row.id)}" class="to-map">Show on map</a>` : '';
	return `<td colspan="${COLUMNS.length}"><div class="detail">
		<h2>${escapeHtml(row.name)} <code>${escapeHtml(row.id)}</code> ${mapLink}</h2>
		${notes}
		${facts ? `<dl>${facts}</dl>` : ''}
	</div></td>`;
}

function render() {
	const rows = rowData.filter(matches).sort(compare);
	tbody.innerHTML = rows
		.map((row) => {
			const selected = row.id === state.selected;
			const cells = COLUMNS.map(
				(c) => `<td class="${classOf(c)}">${c.html ? c.html(row) : escapeHtml(textOf(c, row))}</td>`,
			).join('');
			const main = `<tr class="row${selected ? ' selected' : ''}" data-id="${escapeHtml(row.id)}" tabindex="0" aria-expanded="${selected}">${cells}</tr>`;
			return selected ? main + `<tr class="detail-row">${detailHtml(row)}</tr>` : main;
		})
		.join('');
	if (!rows.length)
		tbody.innerHTML = `<tr><td colspan="${COLUMNS.length}" class="muted empty">No region matches the filters.</td></tr>`;

	countEl.textContent =
		rows.length === rowData.length ? `${rowData.length} regions` : `${rows.length} of ${rowData.length} regions`;
	clearButton.hidden = !Object.values(state.filters).some((f) => f.trim());
	for (const th of container.querySelectorAll('tr.labels th')) {
		const sorted = th.dataset.key === state.sortKey;
		th.setAttribute('aria-sort', sorted ? (state.sortDir > 0 ? 'ascending' : 'descending') : 'none');
		th.querySelector('.arrow').textContent = sorted ? (state.sortDir > 0 ? ' ▲' : ' ▼') : '';
	}
}

container.querySelector('tr.labels').addEventListener('click', (e) => {
	const th = e.target.closest('th');
	if (!th) return;
	if (state.sortKey === th.dataset.key) state.sortDir = -state.sortDir;
	else {
		state.sortKey = th.dataset.key;
		state.sortDir = 1;
	}
	render();
});

container.querySelector('tr.filters').addEventListener('input', (e) => {
	const key = e.target.dataset.key;
	if (!key) return;
	state.filters[key] = e.target.value;
	render();
});

clearButton.addEventListener('click', () => {
	for (const el of container.querySelectorAll('tr.filters input, tr.filters select')) el.value = '';
	for (const key of Object.keys(state.filters)) state.filters[key] = '';
	render();
});

tbody.addEventListener('click', (e) => {
	if (e.target.closest('a, button, input, select')) {
		if (e.target.closest('a.to-map')) {
			e.preventDefault();
			document.getElementById('map').scrollIntoView({ behavior: 'smooth' });
			zoomTo(state.selected);
		}
		return;
	}
	// Selecting text to copy it shouldn't toggle the row.
	if (String(window.getSelection())) return;
	const tr = e.target.closest('tr.row');
	if (tr) toggle(tr.dataset.id);
});

tbody.addEventListener('keydown', (e) => {
	const tr = e.target.closest('tr.row');
	if (!tr || (e.key !== 'Enter' && e.key !== ' ')) return;
	e.preventDefault();
	toggle(tr.dataset.id);
});

function toggle(id) {
	select(id === state.selected ? null : id, { zoom: true });
}

/**
 * Selects a region, or none with `null`: expands its row, highlights it on the map and puts it
 * into the URL hash. `zoom` zooms the map to it, `scroll` scrolls its row into view.
 */
function select(id, { zoom = false, scroll = false } = {}) {
	if (id !== null && !rowData.some((r) => r.id === id)) id = null;
	state.selected = id;
	// A filter that hides the selected region is cleared, so its row can be shown.
	if (id !== null && !matches(rowData.find((r) => r.id === id))) clearButton.click();
	render();
	history.replaceState(null, '', id === null ? location.pathname + location.search : `#${id}`);
	highlight(id);
	if (id === null) return;
	if (zoom) zoomTo(id);
	if (scroll) {
		const tr = tbody.querySelector(`tr.row[data-id="${CSS.escape(id)}"]`);
		tr?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	}
}

// --- Map ---

maplibregl.setRTLTextPlugin('https://tiles.versatiles.org/assets/lib/mapbox-gl-rtl-text/mapbox-gl-rtl-text.js', true);

const map = new maplibregl.Map({
	container: 'map',
	style: 'style.json',
	bounds: [-12, 35, 41, 60],
	attributionControl: { compact: true },
	cooperativeGestures: true,
});

/** Region ID → the integer feature ID that MapLibre's feature state needs. */
const featureIds = new Map(regionFeatures.features.map((f) => [f.properties.id, f.id]));
let highlighted = null;
let mapReady = false;

function highlight(id) {
	if (!mapReady) return;
	if (highlighted !== null) map.setFeatureState({ source: 'regions', id: highlighted }, { selected: false });
	highlighted = featureIds.get(id) ?? null;
	if (highlighted !== null) map.setFeatureState({ source: 'regions', id: highlighted }, { selected: true });
}

function zoomTo(id) {
	const row = rowData.find((r) => r.id === id);
	if (!row?.bbox) return;
	const [w, s, e, n] = row.bbox;
	map.fitBounds(
		[
			[w, s],
			[e, n],
		],
		{ padding: 40, maxZoom: 9 },
	);
}

map.on('load', () => {
	// Region layers go below the basemap's labels slot so country names stay readable.
	const beforeId = map.getStyle().metadata?.beforeId;
	map.addSource('regions', { type: 'geojson', data: regionFeatures });

	map.addLayer(
		{
			id: 'regions-fill',
			type: 'fill',
			source: 'regions',
			paint: {
				'fill-color': ['get', 'statusColor'],
				'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.9, 0.7],
			},
		},
		beforeId,
	);
	map.addLayer(
		{
			id: 'regions-line',
			type: 'line',
			source: 'regions',
			paint: { 'line-color': '#0d1117', 'line-width': 0.5 },
		},
		beforeId,
	);
	map.addLayer(
		{
			id: 'regions-highlight',
			type: 'line',
			source: 'regions',
			paint: {
				'line-color': '#fff',
				'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 2],
				'line-opacity': [
					'case',
					['boolean', ['feature-state', 'selected'], false],
					1,
					['boolean', ['feature-state', 'hover'], false],
					0.7,
					0,
				],
			},
		},
		beforeId,
	);

	mapReady = true;
	highlight(state.selected);
	if (state.selected) zoomTo(state.selected);

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
			p.notesCount > 0 ? `<div class="muted">${p.notesCount} note${p.notesCount === 1 ? '' : 's'}</div>` : '';
		popup
			.setLngLat(e.lngLat)
			.setHTML(
				`<div><b>${escapeHtml(p.name)}</b> <span class="muted">${escapeHtml(p.id)}</span></div>` +
					`<div class="status" style="--status:${p.statusColor}">${escapeHtml(p.status)}</div>` +
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
		select(e.features[0].properties.id, { scroll: true });
	});
});

// --- Start ---

function selectFromHash() {
	const id = decodeURIComponent(location.hash.slice(1));
	select(id || null, { zoom: true, scroll: Boolean(id) });
}

window.addEventListener('hashchange', selectFromHash);
render();
if (location.hash) selectFromHash();
