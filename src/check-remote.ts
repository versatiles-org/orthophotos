/**
 * Validates region metadata against the remote storage.
 *
 * Lists every region with `status === 'released'`, `'scraping'`, or `'planned'`:
 *   - **released**: must have `<ssh_dir>/<id>.versatiles` on the remote; mtime is
 *     compared against `releaseDate`; license/creator/mask are required.
 *   - **scraping**: a remote file is allowed (in-progress upload) but not required;
 *     no `releaseDate` to compare against; metadata fields shown but not enforced.
 *   - **planned**: a remote file would be unexpected; flag if present.
 *
 * Also reports orphan `.versatiles` files on the remote that don't match any
 * known region, so stale uploads stay visible.
 */

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listRemoteVersatilesFiles, type RemoteFile } from './lib/remote-listing.ts';
import { getAllRegionMetadata } from './regions/index.ts';
import type { RegionMetadata, RegionStatus } from './lib/framework.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../data');

/** Mtime drift greater than this → warning. Builds take hours; one day is the comfortable bound. */
const DATE_DRIFT_WARN_DAYS = 1;
/** Mtime drift greater than this → error. Suggests the remote file is from a stale build. */
const DATE_DRIFT_ERROR_DAYS = 7;
/** Files smaller than this → warning. Real region tiles are tens of MB upwards. */
const MIN_REASONABLE_SIZE = 1_000_000;

const TRACKED_STATUSES: ReadonlySet<RegionStatus> = new Set(['released', 'scraping', 'planned']);

const COLORS = {
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	dim: '\x1b[2m',
	red: '\x1b[31m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	cyan: '\x1b[36m',
	gray: '\x1b[90m',
};

type Severity = 'ok' | 'warn' | 'error';

interface Row {
	id: string;
	status: string;
	releaseDate: string;
	remoteSize: string;
	remoteDate: string;
	driftDays: string;
	checks: string;
	severity: Severity;
	notes: string[];
}

function bumpSeverity(current: Severity, next: Severity): Severity {
	if (current === 'error' || next === 'error') return 'error';
	if (current === 'warn' || next === 'warn') return 'warn';
	return 'ok';
}

function formatBytes(n: number): string {
	if (n < 1024) return `${n} B`;
	const units = ['KB', 'MB', 'GB', 'TB'];
	let v = n / 1024;
	let i = 0;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}
	return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

function formatDate(d: Date): string {
	return d.toISOString().slice(0, 10);
}

function diffDays(a: Date, b: Date): number {
	return Math.abs((a.getTime() - b.getTime()) / 86_400_000);
}

function colorize(severity: Severity, text: string): string {
	const c = severity === 'error' ? COLORS.red : severity === 'warn' ? COLORS.yellow : COLORS.green;
	return `${c}${text}${COLORS.reset}`;
}

function severityIcon(severity: Severity): string {
	if (severity === 'error') return colorize('error', '✗');
	if (severity === 'warn') return colorize('warn', '⚠');
	return colorize('ok', '✓');
}

function statusLabel(status: RegionStatus): string {
	switch (status) {
		case 'released':
			return colorize('ok', status);
		case 'scraping':
			return `${COLORS.cyan}${status}${COLORS.reset}`;
		case 'planned':
			return `${COLORS.dim}${status}${COLORS.reset}`;
		case 'blocked':
			return `${COLORS.gray}${status}${COLORS.reset}`;
	}
}

function buildRow(id: string, meta: RegionMetadata, remote: RemoteFile | undefined): Row {
	const notes: string[] = [];
	let severity: Severity = 'ok';
	const checks: string[] = [];

	const releaseDate = meta.releaseDate ?? '';
	const releaseDateObj = releaseDate ? new Date(`${releaseDate}T00:00:00Z`) : undefined;
	const releaseDateValid =
		releaseDate !== '' && /^\d{4}-\d{2}-\d{2}$/.test(releaseDate) && !Number.isNaN(releaseDateObj!.getTime());

	if (meta.status === 'released' && !releaseDateValid) {
		notes.push(`releaseDate "${releaseDate}" is not YYYY-MM-DD`);
		severity = bumpSeverity(severity, 'error');
	}

	const requireMeta = meta.status === 'released';

	if (meta.license) {
		checks.push(colorize('ok', 'L'));
	} else if (requireMeta) {
		notes.push('license missing');
		severity = bumpSeverity(severity, 'error');
		checks.push(colorize('error', 'L'));
	} else {
		checks.push(`${COLORS.dim}L${COLORS.reset}`);
	}

	if (meta.creator) {
		checks.push(colorize('ok', 'C'));
	} else if (requireMeta) {
		notes.push('creator missing');
		severity = bumpSeverity(severity, 'error');
		checks.push(colorize('error', 'C'));
	} else {
		checks.push(`${COLORS.dim}C${COLORS.reset}`);
	}

	if (typeof meta.mask === 'string') {
		const maskPath = resolve(DATA_DIR, meta.mask);
		if (existsSync(maskPath)) {
			checks.push(colorize('ok', 'M'));
		} else {
			notes.push(`mask file missing: data/${meta.mask}`);
			severity = bumpSeverity(severity, requireMeta ? 'error' : 'warn');
			checks.push(colorize(requireMeta ? 'error' : 'warn', 'M'));
		}
	} else if (meta.mask === true) {
		checks.push(colorize('ok', 'M'));
	} else {
		checks.push(`${COLORS.dim}-${COLORS.reset}`);
	}

	let remoteSize = '—';
	let remoteDate = '—';
	let driftStr = '—';

	if (remote) {
		checks.push(colorize('ok', 'R'));
		remoteSize = formatBytes(remote.size);
		remoteDate = formatDate(remote.mtime);

		if (meta.status === 'planned') {
			notes.push('unexpected remote file (status = planned)');
			severity = bumpSeverity(severity, 'warn');
		} else if (meta.status === 'scraping') {
			notes.push('remote file exists');
			severity = bumpSeverity(severity, 'warn');
		} else {
			if (remote.size < MIN_REASONABLE_SIZE) {
				notes.push(`remote size ${remoteSize} suspiciously small`);
				severity = bumpSeverity(severity, 'warn');
			}
			if (meta.status === 'released' && releaseDateValid) {
				const drift = diffDays(remote.mtime, releaseDateObj!);
				driftStr = drift < 1 ? '<1d' : `${Math.round(drift)}d`;
				if (drift > DATE_DRIFT_ERROR_DAYS) {
					notes.push(`mtime drifts ${Math.round(drift)}d from releaseDate`);
					severity = bumpSeverity(severity, 'error');
				} else if (drift > DATE_DRIFT_WARN_DAYS) {
					notes.push(`mtime drifts ${Math.round(drift)}d from releaseDate`);
					severity = bumpSeverity(severity, 'warn');
				}
			}
		}
	} else if (meta.status === 'released') {
		notes.push('remote file missing');
		severity = bumpSeverity(severity, 'error');
		checks.push(colorize('error', 'R'));
	} else {
		checks.push(`${COLORS.dim}-${COLORS.reset}`);
	}

	return {
		id,
		status: statusLabel(meta.status),
		releaseDate: releaseDate || '—',
		remoteSize,
		remoteDate,
		driftDays: driftStr,
		checks: checks.join(' '),
		severity,
		notes,
	};
}

function visibleLength(s: string): number {
	return s.replace(/\x1b\[[0-9;]*m/g, '').length;
}

function pad(s: string, width: number): string {
	const len = visibleLength(s);
	return s + ' '.repeat(Math.max(0, width - len));
}

function renderTable(rows: Row[]): string {
	const headers = ['', 'region', 'status', 'releaseDate', 'remote mtime', 'drift', 'size', 'L C M R', 'notes'];
	const data = rows.map((r) => [
		severityIcon(r.severity),
		r.id,
		r.status,
		r.releaseDate,
		r.remoteDate,
		r.driftDays,
		r.remoteSize,
		r.checks,
		r.notes.join('; '),
	]);

	const widths = headers.map((h, i) => Math.max(visibleLength(h), ...data.map((row) => visibleLength(row[i]))));

	const lines: string[] = [];
	lines.push(headers.map((h, i) => `${COLORS.bold}${pad(h, widths[i])}${COLORS.reset}`).join('  '));
	lines.push(widths.map((w) => `${COLORS.gray}${'─'.repeat(w)}${COLORS.reset}`).join('  '));
	for (const row of data) {
		lines.push(row.map((cell, i) => pad(cell, widths[i])).join('  '));
	}
	return lines.join('\n');
}

async function main(): Promise<void> {
	const allMetadata = getAllRegionMetadata();
	const tracked: { id: string; meta: RegionMetadata }[] = [];
	for (const [id, meta] of allMetadata) {
		if (TRACKED_STATUSES.has(meta.status)) tracked.push({ id, meta });
	}
	tracked.sort((a, b) => a.id.localeCompare(b.id));

	if (tracked.length === 0) {
		console.log(`${COLORS.dim}No released/scraping/planned regions to check.${COLORS.reset}`);
		return;
	}

	console.log(`${COLORS.cyan}Listing remote .versatiles files…${COLORS.reset}`);
	let remoteFiles: RemoteFile[];
	try {
		remoteFiles = await listRemoteVersatilesFiles();
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error(`${COLORS.red}Failed to list remote files:${COLORS.reset} ${msg}`);
		process.exitCode = 1;
		return;
	}
	console.log(`${COLORS.dim}Found ${remoteFiles.length} remote .versatiles files.${COLORS.reset}\n`);

	const remoteByPath = new Map(remoteFiles.map((f) => [f.path, f]));

	const rows: Row[] = tracked.map(({ id, meta }) => buildRow(id, meta, remoteByPath.get(`${id}.versatiles`)));

	console.log(renderTable(rows));

	// Orphans: remote files that don't correspond to any known region (any status)
	const trackedPaths = new Set(tracked.map(({ id }) => `${id}.versatiles`));
	const orphans = remoteFiles.filter((f) => !trackedPaths.has(f.path));

	if (orphans.length > 0) {
		console.log(
			`\n${COLORS.bold}Orphan files on remote${COLORS.reset} ${COLORS.dim}(no matching released/scraping/planned region)${COLORS.reset}:`,
		);
		for (const f of orphans) {
			const region = f.path.replace(/\.versatiles$/, '');
			const meta = allMetadata.get(region);
			const reason = meta ? `metadata.status = ${meta.status}` : 'no metadata entry';
			console.log(
				`  ${colorize('warn', '⚠')} ${pad(f.path, 32)} ${formatBytes(f.size).padStart(10)}  ${formatDate(f.mtime)}  ${COLORS.dim}${reason}${COLORS.reset}`,
			);
		}
	}

	// Summary, broken down by status
	const counts = { ok: 0, warn: 0, error: 0 };
	const byStatus: Record<string, number> = {};
	for (const { meta } of tracked) byStatus[meta.status] = (byStatus[meta.status] ?? 0) + 1;
	for (const r of rows) counts[r.severity]++;

	const statusBreakdown = (['released', 'scraping', 'planned'] as const)
		.filter((s) => byStatus[s])
		.map((s) => `${byStatus[s]} ${s}`)
		.join(', ');

	console.log(
		`\n${COLORS.bold}Summary:${COLORS.reset} ` +
			`${colorize('ok', `${counts.ok} ok`)}, ` +
			`${colorize('warn', `${counts.warn} warn`)}, ` +
			`${colorize('error', `${counts.error} error`)}` +
			(orphans.length > 0 ? `, ${colorize('warn', `${orphans.length} orphan`)}` : '') +
			` (${rows.length} regions: ${statusBreakdown})`,
	);

	if (counts.error > 0) {
		process.exitCode = 2;
	} else if (counts.warn > 0 || orphans.length > 0) {
		process.exitCode = 1;
	}
}

await main();
