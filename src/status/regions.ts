import type { Status } from './status.ts';
import { KnownRegion } from './geojson.ts';
import type { RegionMetadata } from '../lib/framework.ts';

export interface Region {
	id: string;
	status: Status;
	/** Geometry from `data/NUTS_RG_03M_2024_4326.topojson.gz`, or `null` for regions outside that dataset (e.g. `uk` post-Brexit). */
	region: KnownRegion | null;
}

/** Counts the number of matching characters from the start of two strings */
function countMatchingPrefixChars(a: string, b: string): number {
	let matches = 0;
	const minLen = Math.min(a.length, b.length);
	for (let i = 0; i < minLen; i++) {
		if (a[i] === b[i]) matches++;
		else break;
	}
	return matches;
}

/** Finds the most similar region IDs to the given ID */
function findSimilarRegionIds(id: string, knownRegions: KnownRegion[]): string[] {
	const scored = knownRegions.map((r) => ({
		id: r.properties.id,
		score: countMatchingPrefixChars(id, r.properties.id),
	}));
	scored.sort((a, b) => b.score - a.score);
	return scored.slice(0, 10).map((r) => r.id);
}

/** Convert RegionMetadata to Status for the status-check output */
function metadataToStatus(meta: RegionMetadata): Status {
	if (meta.status === 'released') {
		return {
			status: 'success',
			rating: 0,
			notes: meta.notes,
			entries: (meta.entries ?? ['result']).map((name) => ({ name })),
			license: meta.license!,
			creator: meta.creator!,
		};
	}
	return { status: 'error', notes: meta.notes };
}

/**
 * Builds region entries from the given metadata map and matches them with known regions.
 * Regions without a matching known geometry are still returned with `region: null` so they
 * can appear in the status table; the map view skips them.
 *
 * @param knownRegions - Array of known NUTS regions to match against
 * @param allMetadata - Map of region IDs to metadata (raw or aggregated view)
 * @returns Array of regions with their status and (optional) geometry
 */
export function scanRegions(knownRegions: KnownRegion[], allMetadata: Map<string, RegionMetadata>): Region[] {
	const knownRegionIds = new Map<string, KnownRegion>(knownRegions.map((r) => [r.properties.id, r]));
	const entries: Region[] = [];

	for (const [id, metadata] of allMetadata) {
		const region = knownRegionIds.get(id);
		if (!region) {
			console.warn(
				`No known geometry for region "${id}" — keeping in status table but excluding from map. ` +
					`Similar IDs: ${findSimilarRegionIds(id, knownRegions).join(', ')}`,
			);
		}
		entries.push({ id, status: metadataToStatus(metadata), region: region ?? null });
	}

	return entries;
}
