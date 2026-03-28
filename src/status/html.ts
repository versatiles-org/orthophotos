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

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function generateStatusPage(
	allMetadata: Map<string, RegionMetadata>,
	knownRegions: Map<string, KnownRegion>,
): string {
	const rows: string[] = [];

	const sorted = [...allMetadata.entries()].sort((a, b) => a[0].localeCompare(b[0]));

	const counts: Record<RegionStatus, number> = { released: 0, scraping: 0, planned: 0, blocked: 0 };

	for (const [id, meta] of sorted) {
		counts[meta.status]++;
		const region = knownRegions.get(id);
		const name = region?.properties.fullname ?? id;
		const color = STATUS_COLORS[meta.status];
		const license = meta.license
			? `<a href="${escapeHtml(meta.license.url)}">${escapeHtml(meta.license.name)}</a>`
			: '';
		const creator = meta.creator
			? `<a href="${escapeHtml(meta.creator.url)}">${escapeHtml(meta.creator.name)}</a>`
			: '';
		let notesHtml = '';
		if (meta.notes.length > 0) {
			const list = meta.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('');
			notesHtml = `<details><summary>${meta.notes.length} note${meta.notes.length > 1 ? 's' : ''}</summary><ul>${list}</ul></details>`;
		}

		const releaseDate = meta.status === 'released' ? meta.releaseDate : '';

		rows.push(`<tr>
			<td>${escapeHtml(id)}</td>
			<td>${escapeHtml(name)}</td>
			<td><span style="color:${color};font-weight:bold">${STATUS_LABELS[meta.status]}</span></td>
			<td>${releaseDate}</td>
			<td>${meta.date ?? ''}</td>
			<td>${license}</td>
			<td>${creator}</td>
			<td class="notes">${notesHtml}</td>
		</tr>`);
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
<style>
	body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; margin: 0; padding: 20px; background: #0d1117; color: #e6edf3; }
	h1 { margin: 0 0 8px; }
	.summary { margin-bottom: 16px; font-size: 14px; color: #8b949e; }
	table { border-collapse: collapse; width: 100%; font-size: 14px; table-layout: fixed; }
	th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #21262d; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	th { background: #161b22; color: #8b949e; font-weight: 600; position: sticky; top: 0; z-index: 1; }
	tr:hover { background: #161b22; }
	td:hover { overflow: visible; white-space: normal; word-break: break-word; }
	a { color: #58a6ff; text-decoration: none; }
	a:hover { text-decoration: underline; }
	col.col-id { width: 150px; }
	col.col-name { }
	col.col-status { width: 100px; }
	col.col-released { width: 130px; }
	col.col-date { width: 100px; }
	col.col-license { width: 150px; }
	col.col-creator { }
	col.col-notes { width: 200px; }
	td.notes { font-size: 12px; color: #8b949e; }
	td.notes details summary { cursor: pointer; color: #8b949e; }
	td.notes details summary:hover { color: #e6edf3; }
	td.notes details { white-space: normal; }
	td.notes ul { margin: 4px 0 0; padding-left: 18px; }
</style>
</head>
<body>
<h1>VersaTiles Orthophotos</h1>
<p class="summary">${allMetadata.size} regions &middot; ${summary}</p>
<table>
<colgroup>
<col class="col-id"><col class="col-name"><col class="col-status"><col class="col-released"><col class="col-date"><col class="col-license"><col class="col-creator"><col class="col-notes">
</colgroup>
<thead>
<tr><th>ID</th><th>Name</th><th>Status</th><th>Released</th><th>Date</th><th>License</th><th>Creator</th><th>Notes</th></tr>
</thead>
<tbody>
${rows.join('\n')}
</tbody>
</table>
</body>
</html>
`;
}
