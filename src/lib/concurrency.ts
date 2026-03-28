/**
 * Concurrency limit resolution.
 */

import { availableParallelism, totalmem } from 'node:os';

/** Limits for concurrency. The effective concurrency is the minimum of all applicable limits. */
export interface ConcurrencyLimitObject {
	/** CPU cores per process (default: 4). Concurrency = availableParallelism() / cores. */
	cores?: number;
	/** Hard maximum concurrency. */
	concurrency?: number;
	/** GB of RAM per process. Concurrency = totalMemoryGB / memoryGB. */
	memoryGB?: number;
}

/** A number is shorthand for { concurrency: n }. */
export type ConcurrencyLimit = number | ConcurrencyLimitObject;

export function resolveConcurrency(limit?: ConcurrencyLimit, defaultConcurrency = 4): number {
	if (typeof limit === 'number') return Math.max(1, limit);
	if (limit === undefined) return defaultConcurrency;
	const cpuLimit = limit.cores ? Math.floor(availableParallelism() / limit.cores) : Infinity;
	const memLimit = limit.memoryGB ? Math.floor(totalmem() / 1e9 / limit.memoryGB) : Infinity;
	const hardLimit = limit.concurrency ?? Infinity;
	return Math.max(1, Math.min(cpuLimit, memLimit, hardLimit));
}
