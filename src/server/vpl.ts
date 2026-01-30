import { resolve } from '@std/path';
import { walkSync } from '@std/fs';
import { getDataDir } from '../config.ts';

/**
 * Generates a VersaTiles Pipeline Language (VPL) configuration file.
 * Combines orthophoto tiles with satellite imagery (S2GM and Blue Marble).
 * @param filename - Output filename for the VPL file (relative to data directory)
 */
export function generateVPL(filename: string) {
	const path = resolve(getDataDir());
	const srcOrthophotos = resolve(path, 'orthophotos/');
	const srcSatellite = resolve(path, 'satellite/');

	const containers: string[] = [];
	for (
		const container of walkSync(srcOrthophotos, { exts: ['.versatiles'], includeDirs: false })
	) {
		containers.push(`from_container filename="${container.path}" | raster_overscale`);
	}

	containers.push(
		`from_container filename="${srcSatellite}/s2gm/s2gm_overview.versatiles" | raster_overscale`,
	);
	containers.push(
		`from_container filename="${srcSatellite}/bluemarble/bluemarble.versatiles" | raster_levels gamma=0.8 brightness=0.2 contrast=0.8 | raster_overscale`,
	);

	const vpl = `from_stacked_raster [
  		${containers.join(',\n  ')}
	]
      | filter level_max=19
      | meta_update attribution="Various sources"
	`;

	Deno.writeTextFileSync(resolve(path, filename), vpl);
}
