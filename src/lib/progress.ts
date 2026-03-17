/**
 * Progress tracker with bar display and ETA calculation.
 *
 * Usage:
 *   const progress = createProgress(total);
 *   progress.tick('converted');   // count towards ETA
 *   progress.tick('skipped');     // don't count towards ETA
 *   progress.done();
 */

function formatDuration(seconds: number): string {
	if (seconds < 60) return `${Math.round(seconds)}s`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
	if (seconds < 86400) {
		const h = Math.floor(seconds / 3600);
		const m = Math.round((seconds % 3600) / 60);
		return `${h}h ${m}m`;
	}
	const d = Math.floor(seconds / 86400);
	const h = Math.round((seconds % 86400) / 3600);
	return `${d}d ${h}h`;
}

function renderBar(done: number, total: number, width: number): string {
	const fraction = total > 0 ? done / total : 0;
	const filled = Math.round(fraction * width);
	return '[' + '='.repeat(filled) + (filled < width ? '>' : '') + ' '.repeat(Math.max(0, width - filled - 1)) + ']';
}

export interface Progress {
	/** Record one completed item. Only `etaLabel` items contribute to ETA calculation. */
	tick(label: string): void;
	/** Get the current count for a label. */
	count(label: string): number;
	/** Print final summary and newline. */
	done(): void;
}

export interface ProgressOptions {
	/** The label whose items are used for ETA calculation. */
	etaLabel: string;
	/** All labels to display, in order. Defaults to just the etaLabel. */
	labels?: string[];
	/** Bar width in characters. Default: 30. */
	barWidth?: number;
	/** Non-TTY log interval (every N items). Default: 100. */
	logInterval?: number;
}

export function createProgress(total: number, options: ProgressOptions): Progress {
	const { etaLabel, barWidth = 30, logInterval = 100 } = options;
	const labels = options.labels ?? [etaLabel];
	const counts = new Map<string, number>();
	for (const l of labels) counts.set(l, 0);

	let etaTimeMs = 0;
	let lastTickStart = performance.now();
	const isTTY = process.stderr.isTTY ?? false;

	function totalDone(): number {
		let sum = 0;
		for (const v of counts.values()) sum += v;
		return sum;
	}

	function render(): string {
		const done = totalDone();
		const remaining = total - done;
		const etaCount = counts.get(etaLabel) ?? 0;
		const avgMs = etaCount > 0 ? etaTimeMs / etaCount : 0;
		const etaSec = (avgMs * remaining) / 1000;
		const eta = etaCount > 0 ? ` | ETA: ${formatDuration(etaSec)}` : '';
		const stats = labels.map((l) => `${counts.get(l) ?? 0} ${l}`).join(', ');
		return `  ${renderBar(done, total, barWidth)} ${done}/${total} | ${stats}${eta}`;
	}

	return {
		tick(label: string) {
			const now = performance.now();
			if (label === etaLabel) {
				etaTimeMs += now - lastTickStart;
			}
			counts.set(label, (counts.get(label) ?? 0) + 1);

			const line = render();
			if (isTTY) {
				process.stderr.write(`\r${line}`);
			} else if (totalDone() % logInterval === 0) {
				console.log(line);
			}

			lastTickStart = performance.now();
		},

		count(label: string): number {
			return counts.get(label) ?? 0;
		},

		done() {
			if (isTTY) process.stderr.write('\n');
			const stats = labels.map((l) => `${counts.get(l) ?? 0} ${l}`).join(', ');
			console.log(`  Done: ${stats}`);
		},
	};
}
