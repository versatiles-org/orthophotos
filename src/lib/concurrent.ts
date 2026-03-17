/**
 * Process array items concurrently with a configurable concurrency limit
 * and an optional integrated progress bar.
 *
 * Without progress:
 *   await concurrent(items, 8, async (item) => { ... });
 *
 * With progress:
 *   await concurrent(items, 8, async (item) => {
 *     if (exists(item)) return 'skipped';
 *     await download(item);
 *     return 'converted';
 *   }, { labels: ['converted', 'skipped'] });
 */

import { createProgress, type ProgressOptions } from './progress.ts';

export async function concurrent<T>(
	items: T[],
	concurrency: number,
	fn: (item: T, index: number) => Promise<string | void>,
	progressOptions?: ProgressOptions,
): Promise<void> {
	const progress = progressOptions ? createProgress(items.length, progressOptions) : undefined;

	let nextIndex = 0;
	const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (nextIndex < items.length) {
			const i = nextIndex++;
			const label = await fn(items[i], i);
			if (progress && label) progress.tick(label);
		}
	});
	await Promise.all(workers);

	if (progress) progress.done();
}
