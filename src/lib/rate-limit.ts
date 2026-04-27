/**
 * Iterate items at a fixed minimum interval, optionally skipping cached
 * results and retrying transient failures.
 *
 * Useful for paginated feeds and other per-request rate-limited APIs where
 * `downloadFiles({ intervalMs })` is too rigid (e.g. when items can be
 * skipped or progress needs per-outcome labels).
 */

import { sleep } from './delay.ts';
import { type RetryOptions, withRetry } from './retry.ts';

export interface FetchWithIntervalOptions<T, R> {
	/** Minimum delay between fetches. The first fetch runs immediately. */
	intervalMs: number;
	/** Wrap each fetch in `withRetry` with these options. */
	retry?: RetryOptions;
	/** Skip an item without resetting the interval timer. */
	shouldFetch?: (item: T) => boolean;
	/** Called for each item that was skipped (after `shouldFetch` returned false). */
	onSkip?: (item: T) => void;
	/** Called for each item that was fetched, after a successful fetch. */
	onFetch?: (item: T, result: R) => void;
}

export async function fetchWithInterval<T, R>(
	items: T[],
	fetch: (item: T) => Promise<R>,
	options: FetchWithIntervalOptions<T, R>,
): Promise<void> {
	const { intervalMs, retry, shouldFetch, onSkip, onFetch } = options;
	let firstFetch = true;
	for (const item of items) {
		if (shouldFetch && !shouldFetch(item)) {
			onSkip?.(item);
			continue;
		}
		if (!firstFetch) await sleep(intervalMs);
		firstFetch = false;
		const result = retry ? await withRetry(() => fetch(item), retry) : await fetch(item);
		onFetch?.(item, result);
	}
}
