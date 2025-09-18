import { resolve } from '@std/path';
import { walkSync } from '@std/fs';

export function generateVPL(filename: string) {
	const path = resolve(Deno.env.get('dir_data')!);
	const srcOrthophotos = resolve(path, 'orthophotos/');
	const srcSatellite = resolve(path, 'satellite/');

	const constainers: string[] = [];
	for (const container of walkSync(srcOrthophotos, { exts: ['.versatiles'], includeDirs: false })) {
		constainers.push(`from_container filename="${container.path}" | raster_overscale`);
	}

	constainers.push(`from_container filename="${srcSatellite}/s2gm/s2gm_overview.versatiles" | raster_overscale`);
	constainers.push(`from_container filename="${srcSatellite}/bluemarble/bluemarble.versatiles" | raster_levels gamma=0.8 | raster_overscale`);

	const vpl = `from_stacked_raster minimize_recompression=true [
  		${constainers.join(',\n  ')}
	]
      | filter level_max=19
      | meta_update attribution="Various sources"
	`;

	Deno.writeTextFileSync(resolve(path, filename), vpl);
}