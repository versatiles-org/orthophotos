/**
 * Awaitable delay used by retry/backoff logic and rate-limited fetch loops.
 */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
