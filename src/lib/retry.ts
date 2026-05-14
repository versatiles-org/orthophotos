/**
 * Retry logic wrapper for operations that may fail due to transient issues.
 */

import { sleep } from './delay.ts';

export interface RetryOptions {
	maxAttempts?: number;
	initialDelayMs?: number;
	maxDelayMs?: number;
	backoffMultiplier?: number;
	/**
	 * Predicate: returns true when `err` is worth retrying, false to abort
	 * immediately and re-throw. Use this for deterministic server responses
	 * (e.g. ERDAS APOLLO `LayerNotDefined`, GeoServer `RasterFormatException`)
	 * where retries waste time and amplify log noise. Default: always retry.
	 */
	shouldRetry?: (err: Error) => boolean;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'shouldRetry'>> = {
	maxAttempts: 3,
	initialDelayMs: 1000,
	maxDelayMs: 30000,
	backoffMultiplier: 2,
};

/**
 * Executes an async function with exponential backoff retry logic.
 * @param fn The async function to execute
 * @param options Retry configuration options
 * @returns The result of the function
 * @throws The last error if all attempts fail
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
	const opts = { ...DEFAULT_OPTIONS, ...options };
	const shouldRetry = options.shouldRetry;
	let lastError: Error | undefined;
	let delay = opts.initialDelayMs;

	for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			if (attempt === opts.maxAttempts) {
				break;
			}

			if (shouldRetry && !shouldRetry(lastError)) {
				break;
			}

			console.warn(`Attempt ${attempt}/${opts.maxAttempts} failed: ${lastError.message}. Retrying in ${delay}ms...`);

			await sleep(delay);
			delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
		}
	}

	throw lastError;
}
