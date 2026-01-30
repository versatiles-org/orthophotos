import { relative, resolve } from '@std/path';
import { existsSync } from '@std/fs';
import { readStatus, Status } from './status.ts';
import { KnownRegion, reducePrecision } from './geojson.ts';
import type { Feature } from 'geojson';
import { getDataDir } from '../config.ts';
import { runCommand } from '../lib/command.ts';

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

/** Recursively scans a directory for status.yml files */
function scanDirectory(
	directory: string,
	baseDirectory: string,
	knownRegionIds: Map<string, KnownRegion>,
	knownRegions: KnownRegion[],
	entries: Region[],
): void {
	const statusFilename = resolve(directory, 'status.yml');
	if (existsSync(statusFilename)) {
		const id = relative(baseDirectory, directory).replaceAll('\\', '/');
		try {
			const status = readStatus(statusFilename);
			const region = knownRegionIds.get(id);
			if (!region) {
				console.log('Similar Ids:', findSimilarRegionIds(id, knownRegions));
				throw new Error(`Unknown region ID: ${id}`);
			}
			entries.push({ id, status, region });
		} catch (error) {
			throw new Error(`Error processing region "${id}" (${statusFilename})`, {
				cause: error,
			});
		}
	} else {
		const directoryEntries = [...Deno.readDirSync(directory)];
		directoryEntries.sort((a, b) => a.name.localeCompare(b.name));
		for (const entry of directoryEntries) {
			if (entry.isDirectory) {
				scanDirectory(
					resolve(directory, entry.name),
					baseDirectory,
					knownRegionIds,
					knownRegions,
					entries,
				);
			}
		}
	}
}

/**
 * Scans a directory tree for region status files and matches them with known regions.
 * @param baseDirectory - Root directory to scan for status.yml files
 * @param knownRegions - Array of known NUTS regions to match against
 * @returns Array of regions with their status and geometry
 * @throws Error if a region ID doesn't match any known region
 */
export function scanRegions(baseDirectory: string, knownRegions: KnownRegion[]): Region[] {
	const knownRegionIds = new Map<string, KnownRegion>(
		knownRegions.map((r) => [r.properties.id, r]),
	);
	const entries: Region[] = [];

	scanDirectory(baseDirectory, baseDirectory, knownRegionIds, knownRegions, entries);

	return entries;
}

/** Creates a GeoJSON outline file for a VersaTiles container */
async function createGeoJsonOutline(
	versaTilesFilename: string,
	geoJsonFilename: string,
): Promise<void> {
	console.log(`Creating GeoJSON for ${versaTilesFilename}`);
	await runCommand('versatiles', ['dev', 'export-outline', versaTilesFilename, geoJsonFilename]);
}

/**
 * Updates region entries with VersaTiles existence status and GeoJSON outlines.
 * Creates GeoJSON outline files for existing VersaTiles containers if they don't exist.
 * @param regions - Array of regions to update
 */
export async function updateRegionEntries(regions: Region[]): Promise<void> {
	const orthophotosPath = resolve(getDataDir(), 'orthophotos/');

	for (const region of regions) {
		if (region.status.status !== 'success') continue;

		for (const entry of region.status.entries) {
			const versaTilesFilename = resolve(
				orthophotosPath,
				region.id,
				`${entry.name}.versatiles`,
			);

			entry.versaTilesExists = existsSync(versaTilesFilename);

			if (!entry.versaTilesExists) {
				console.warn(`Warning: Missing ${relative(orthophotosPath, versaTilesFilename)}`);
				continue;
			}

			const geoJsonFilename = resolve(orthophotosPath, region.id, `${entry.name}.geojson`);

			if (!existsSync(geoJsonFilename)) {
				await createGeoJsonOutline(versaTilesFilename, geoJsonFilename);
			}

			if (!existsSync(geoJsonFilename)) {
				throw new Error(`Failed to create ${geoJsonFilename}`);
			}

			const geoJSON = JSON.parse(await Deno.readTextFile(geoJsonFilename)) as Feature;
			reducePrecision(geoJSON);
			entry.geoJSON = {
				type: 'Feature',
				geometry: geoJSON.geometry,
				properties: {},
			};
		}
	}
}
