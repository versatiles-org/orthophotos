import { relative, resolve } from '@std/path';
import { existsSync } from '@std/fs';
import { readStatus, Status } from './status.ts';
import { KnownRegion } from './geojson.ts';

interface Region {
	id: string;
	status: Status;
}

export function scanProcessedRegions(base_directory: string, knownRegions: KnownRegion[]): Region[] {
	const knownRegionIds = new Set(knownRegions.map((region) => region.properties.id));
	const entries: Region[] = [];

	recursive(base_directory);

	function recursive(directory: string) {
		const statusFilename = resolve(directory, 'status.yml');
		if (existsSync(statusFilename)) {
			try {
				const status = readStatus(statusFilename);
				const id = relative(base_directory, directory).replaceAll('\\', '/');
				if (!knownRegionIds.has(id)) {
					console.log('Similar Ids:', find(id));
					throw new Error(`Unknown region ID: ${id}`);
				}
				entries.push({ id, status });
			} catch (error) {
				console.error(`Error reading ${statusFilename}`);
				throw error;
			}
		} else {
			const directoryEntries = [...Deno.readDirSync(directory)];
			directoryEntries.sort((a, b) => a.name.localeCompare(b.name));
			for (const entry of directoryEntries) {
				if (entry.isDirectory) {
					recursive(resolve(directory, entry.name));
				}
			}
		}
	}

	return entries;

	function find(id: string): string[] {
		const ids = knownRegions.map((r) => ({
			id: r.properties.id,
			distance: matchingCharacters(id, r.properties.id)
		}));
		ids.sort((a, b) => b.distance - a.distance);
		return ids.slice(0, 10).map((r) => r.id);

		function matchingCharacters(a: string, b: string): number {
			let matches = 0;
			for (let i = 0; i < Math.min(a.length, b.length); i++) {
				if (a[i] === b[i]) matches++;
				else break;
			}
			return matches;
		}
	}
}
