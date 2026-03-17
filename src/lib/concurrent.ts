/**
 * Process array items concurrently with a configurable concurrency limit.
 *
 * Usage:
 *   await concurrent(urls, 8, async (url) => {
 *     await download(url);
 *   });
 */

export async function concurrent<T>(
	items: T[],
	concurrency: number,
	fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
	let nextIndex = 0;
	const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (nextIndex < items.length) {
			const i = nextIndex++;
			await fn(items[i], i);
		}
	});
	await Promise.all(workers);
}
