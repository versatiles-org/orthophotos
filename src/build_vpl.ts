import { resolve } from '@std/path';
import { scanRegions } from './lib/regions.ts';
import { existsSync } from "@std/fs/exists";

const remoteDir = Deno.env.get('dir_remote')!;
const serverDir = Deno.env.get('dir_server')!;
const localDir = resolve(Deno.cwd(), 'regions');

const regions = scanRegions(localDir);
const constainers = [];
for (const region of regions) {
	if (region.status.status === 'error') continue;
	const status = region.status;

	const directory = resolve(remoteDir, 'orthophoto', region.directory);

	for (const file of status.data) {
		const src = resolve(directory, file + '.versatiles');
		if (!existsSync(src)) continue;
		constainers.push(`from_container filename="${src}"`);
	}
}
constainers.push(`from_container filename="${resolve(remoteDir,'download/satellite/satellite.versatiles')}" | raster_overscale`);

const vpl = `from_stacked_raster [
  ${constainers.join(',\n  ')}
]
  | filter level_max=19
  | meta_update attribution="Various sources"`

Deno.writeTextFileSync(resolve(serverDir, 'sat.vpl'), vpl);