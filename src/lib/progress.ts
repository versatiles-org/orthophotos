/**
 * Progress tracker with bar display and ETA calculation.
 *
 * Usage:
 *   const progress = createProgress(total, { labels: ['converted', 'skipped'] });
 *   progress.tick('converted');
 *   progress.tick('skipped');
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
	/** Record one completed item. */
	tick(label: string): void;
	/** Get the current count for a label. */
	count(label: string): number;
	/** Print final summary and newline. */
	done(): void;
}

export interface ProgressOptions {
	/** Labels to display, in order. */
	labels: string[];
	/** Bar width in characters. Default: 30. */
	barWidth?: number;
	/** Non-TTY log interval (every N items). Default: 100. */
	logInterval?: number;
	/** Emit OSC 9;4 terminal progress sequences (for tab/titlebar progress). Default: false. */
	terminalProgress?: boolean;
}

export function createProgress(total: number, options: ProgressOptions): Progress {
	const { labels, barWidth = 30, logInterval = 100, terminalProgress = false } = options;
	const counts = new Map<string, number>();
	for (const l of labels) counts.set(l, 0);

	const startTime = performance.now();
	const isTTY = process.stderr.isTTY ?? false;

	function totalDone(): number {
		let sum = 0;
		for (const v of counts.values()) sum += v;
		return sum;
	}

	function render(): string {
		const done = totalDone();
		const remaining = total - done;
		const elapsedMs = performance.now() - startTime;
		const avgMs = done > 0 ? elapsedMs / done : 0;
		const etaSec = (avgMs * remaining) / 1000;
		const eta = done > 0 ? ` | ETA: ${formatDuration(etaSec)}` : '';
		const stats = labels.map((l) => `${counts.get(l) ?? 0} ${l}`).join(', ');
		return `  ${renderBar(done, total, barWidth)} ${done}/${total} | ${stats}${eta}`;
	}

	function osc9(percent: number) {
		if (isTTY && terminalProgress) process.stderr.write(`\x1b]9;4;1;${Math.round(percent)}\x07`);
	}

	function osc9Clear() {
		if (isTTY && terminalProgress) process.stderr.write('\x1b]9;4;0;0\x07');
	}

	function draw() {
		const done = totalDone();
		const line = render();
		if (isTTY) {
			process.stderr.write(`\r${line}`);
			osc9(total > 0 ? (done / total) * 100 : 0);
		} else if (done % logInterval === 0) {
			console.log(line);
		}
	}

	draw();

	return {
		tick(label: string) {
			counts.set(label, (counts.get(label) ?? 0) + 1);
			draw();
		},

		count(label: string): number {
			return counts.get(label) ?? 0;
		},

		done() {
			osc9Clear();
			if (isTTY) process.stderr.write('\n');
			const stats = labels.map((l) => `${counts.get(l) ?? 0} ${l}`).join(', ');
			console.log(`  Done: ${stats}`);
		},
	};
}
