import { resolve } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import { getDataDir } from '../config.ts';
import { getAllRegionMetadata } from '../regions/index.ts';

/**
 * Generates a VersaTiles Pipeline Language (VPL) configuration file.
 * Stacks orthophoto containers from all successful regions onto satellite imagery.
 * @param filename - Output filename for the VPL file (relative to data directory)
 */
export function generateVPL(filename: string) {
	const dataDir = resolve(getDataDir());
	const orthophotosDir = resolve(dataDir, 'orthophotos');
	const satelliteDir = resolve(dataDir, 'satellite');

	const layers: string[] = [];

	// Add orthophoto layers for all successful regions
	const allMetadata = getAllRegionMetadata();
	for (const [id, meta] of allMetadata) {
		if (meta.status !== 'success') continue;

		const entries = meta.entries ?? ['result'];
		for (const entry of entries) {
			const path = resolve(orthophotosDir, id, `${entry}.versatiles`);
			if (!existsSync(path)) continue;
			layers.push(`from_container filename="${path}" | filter level_min=11`);
		}
	}

	// Add satellite base layers
	layers.push(`from_container filename="${satelliteDir}/s2gm/s2gm_overview.versatiles"`);
	layers.push(
		`from_container filename="${satelliteDir}/bluemarble/bluemarble.versatiles" | raster_levels gamma=0.8 brightness=0.2 contrast=0.8`,
	);

	const vpl = `from_stacked_raster auto_overscale=true [
  ${layers.join(',\n  ')}
] | meta_update
  name="VersaTiles - Satellite + Orthophotos"
  description="High-resolution satellite and orthophoto imagery from various providers, merged by VersaTiles."
  schema="rgb"
  attribution="<a href='https://versatiles.org/sources/'>VersaTiles sources</a>"
`;

	writeFileSync(resolve(dataDir, filename), vpl);
	console.log(`Wrote VPL with ${layers.length - 2} orthophoto layers to ${filename}`);
}
