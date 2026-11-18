/**
 * The status the status page shows: the status in a region's code, updated by whether the
 * region's file is on the storage box, as `npm run build:stats` last listed it.
 *
 * Before a release, the files of the regions to rebuild are renamed (see
 * `docs/building-a-release.md`), so a missing file means "not rebuilt yet" and a file means
 * "done for this release", even before its `releaseDate` is set in the code.
 */

import type { RegionStatus } from '../lib/index.ts';

/** `outdated`: released before, but its file for the coming release isn't on the storage box yet. */
export type DisplayStatus = RegionStatus | 'outdated';

/**
 * @param status - The status in the region's code.
 * @param hasFile - Whether the region's file is on the storage box, or `undefined` without a
 *   listing, in which case the code's status is shown as it is.
 */
export function currentStatus(status: RegionStatus, hasFile: boolean | undefined): DisplayStatus {
	if (hasFile === undefined) return status;
	if (status === 'released' && !hasFile) return 'outdated';
	if (status === 'scraping' && hasFile) return 'released';
	return status;
}

/**
 * The status of a row that stands for several regions (`aggregateUnder`): their shared status;
 * `outdated` while some are released and the others not rebuilt yet; otherwise `scraping`.
 */
export function combinedStatus(statuses: DisplayStatus[]): DisplayStatus {
	if (statuses.length === 0) throw new Error('combinedStatus: no statuses');
	const set = new Set(statuses);
	if (set.size === 1) return statuses[0];
	if ([...set].every((s) => s === 'released' || s === 'outdated')) return 'outdated';
	return 'scraping';
}
