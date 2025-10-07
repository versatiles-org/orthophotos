import { relative, resolve } from '@std/path';
import { existsSync } from '@std/fs';
import { readStatus, Status } from './status.ts';
import { KnownRegion, reducePrecision } from './geojson.ts';
import type { Feature } from 'geojson';

interface Region {
	id: string;
	status: Status;
	region: KnownRegion;
}

export function scanRegions(base_directory: string, knownRegions: KnownRegion[]): Region[] {
	const knownRegionIds = new Map<string, KnownRegion>(knownRegions.map((r) => [r.properties.id, r]));
	const entries: Region[] = [];

	recursive(base_directory);

	function recursive(directory: string) {
		const statusFilename = resolve(directory, 'status.yml');
		if (existsSync(statusFilename)) {
			try {
				const status = readStatus(statusFilename);
				const id = relative(base_directory, directory).replaceAll('\\', '/');
				const region = knownRegionIds.get(id);
				if (!region) {
					console.log('Similar Ids:', find(id));
					throw new Error(`Unknown region ID: ${id}`);
				}
				entries.push({ id, status, region });
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

export async function updateRegionEntries(regions: Region[]): Promise<void> {
	const orthophotosPath = resolve(Deno.env.get('dir_data')!, 'orthophotos/');
	for (const region of regions) {
		if (region.status.status !== 'success') continue;
		for (const entry of region.status.entries) {
			const versaTilesFilename = resolve(
				orthophotosPath,
				region.id,
				`${entry.name}.versatiles`
			);
			entry.versaTilesExists = existsSync(versaTilesFilename);

			const geoJsonFilename = resolve(
				orthophotosPath,
				region.id,
				`${entry.name}.geojson`
			);
			if (!existsSync(geoJsonFilename)) {
				console.log(`Creating GeoJSON for ${versaTilesFilename}`);
				const args = [
					'dev',
					'export-outline',
					versaTilesFilename,
					geoJsonFilename,
				];
				const command = new Deno.Command('versatiles', { args, stdout: 'inherit', stderr: 'inherit' });
				await command.output();
			}
			if (!existsSync(geoJsonFilename)) {
				throw new Error(`Failed to create ${geoJsonFilename}`);
			}

			entry.geoJSON = JSON.parse(await Deno.readTextFile(geoJsonFilename)) as Feature;
			reducePrecision(entry.geoJSON);
		};
	}
}
