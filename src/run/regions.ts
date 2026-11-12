/**
 * Runs a batch of regions one after another.
 */

export interface RegionFailure {
	name: string;
	error: unknown;
}

/**
 * Calls `run` for every region in order. When the batch has more than one region, a failing
 * region is reported through `onError` and the batch continues with the next one, so a long
 * build keeps the machine busy. A single region rethrows, as before.
 *
 * Returns the regions that failed, in order.
 */
export async function runRegions(
	names: string[],
	run: (name: string) => Promise<void>,
	onError: (name: string, error: unknown) => void,
): Promise<RegionFailure[]> {
	const failures: RegionFailure[] = [];
	for (const name of names) {
		try {
			await run(name);
		} catch (error) {
			if (names.length === 1) throw error;
			onError(name, error);
			failures.push({ name, error });
		}
	}
	return failures;
}
