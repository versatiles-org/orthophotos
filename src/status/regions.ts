import type { Status } from './status.ts';
import { KnownRegion } from './geojson.ts';
import { runCommand } from '../lib/command.ts';
import type { RegionMetadata } from '../lib/framework.ts';
import { getAllRegionMetadata } from '../regions/index.ts';

export interface Region {
	id: string;
	status: Status;
	region: KnownRegion;
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
 * Builds region entries from the TypeScript region registry and matches them with known regions.
 * @param knownRegions - Array of known NUTS regions to match against
 * @returns Array of regions with their status and geometry
 * @throws Error if a region ID doesn't match any known region
 */
export function scanRegions(knownRegions: KnownRegion[]): Region[] {
	const knownRegionIds = new Map<string, KnownRegion>(knownRegions.map((r) => [r.properties.id, r]));
	const allMetadata = getAllRegionMetadata();
	const entries: Region[] = [];

	for (const [id, metadata] of allMetadata) {
		const region = knownRegionIds.get(id);
		if (!region) {
			console.log('Similar Ids:', findSimilarRegionIds(id, knownRegions));
			throw new Error(`Unknown region ID: ${id}`);
		}
		entries.push({ id, status: metadataToStatus(metadata), region });
	}

	return entries;
}

/** Creates a GeoJSON outline file for a VersaTiles container */
async function createGeoJsonOutline(versaTilesFilename: string, geoJsonFilename: string): Promise<void> {
	console.log(`Creating GeoJSON for ${versaTilesFilename}`);
	await runCommand('versatiles', ['dev', 'export-outline', versaTilesFilename, geoJsonFilename]);
}
