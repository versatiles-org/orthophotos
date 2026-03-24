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

	// Sort: released first, then scraping, planned, blocked; within each group alphabetically
	const statusOrder: RegionStatus[] = ['released', 'scraping', 'planned', 'blocked'];
	const sorted = [...allMetadata.entries()].sort((a, b) => {
		const sa = statusOrder.indexOf(a[1].status);
		const sb = statusOrder.indexOf(b[1].status);
		if (sa !== sb) return sa - sb;
		return a[0].localeCompare(b[0]);
	});

	const counts: Record<RegionStatus, number> = { released: 0, scraping: 0, planned: 0, blocked: 0 };

	for (const [id, meta] of sorted) {
		counts[meta.status]++;
		const region = knownRegions.get(id);
		const name = region?.properties.fullname ?? id;
		const color = STATUS_COLORS[meta.status];
		const license = meta.license ? escapeHtml(meta.license.name) : '';
		const creator = meta.creator
			? `<a href="${escapeHtml(meta.creator.url)}">${escapeHtml(meta.creator.name)}</a>`
			: '';
		const notes = meta.notes.map((n) => escapeHtml(n)).join('<br>');

		rows.push(`<tr>
			<td>${escapeHtml(id)}</td>
			<td>${escapeHtml(name)}</td>
			<td><span style="color:${color};font-weight:bold">${STATUS_LABELS[meta.status]}</span></td>
			<td>${meta.date ?? ''}</td>
			<td>${license}</td>
			<td>${creator}</td>
			<td class="notes">${notes}</td>
		</tr>`);
	}

	const summary = statusOrder
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
	table { border-collapse: collapse; width: 100%; font-size: 14px; }
	th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #21262d; }
	th { background: #161b22; color: #8b949e; font-weight: 600; position: sticky; top: 0; }
	tr:hover { background: #161b22; }
	a { color: #58a6ff; text-decoration: none; }
	a:hover { text-decoration: underline; }
	td.notes { font-size: 12px; color: #8b949e; max-width: 400px; }
</style>
</head>
<body>
<h1>VersaTiles Orthophotos</h1>
<p class="summary">${allMetadata.size} regions &middot; ${summary}</p>
<table>
<thead>
<tr><th>ID</th><th>Name</th><th>Status</th><th>Date</th><th>License</th><th>Creator</th><th>Notes</th></tr>
</thead>
<tbody>
${rows.join('\n')}
</tbody>
</table>
</body>
</html>
`;
}
