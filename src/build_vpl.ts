import { resolve } from '@std/path';
import { scanRegions } from './lib/regions.ts';
import { existsSync } from "@std/fs/exists";

const remoteDir = Deno.env.get('dir_remote')!;
const remoteURL = Deno.env.get('url_remote')!;
const serverDir = Deno.env.get('dir_server')!;
const localDir = resolve(Deno.cwd(), 'regions');

const regions = scanRegions(localDir);
let constainers = [];
for (const region of regions) {
	if (region.status.status === 'error') continue;
	const status = region.status;


	for (const file of status.data) {
		const srcPath = resolve(remoteDir, 'orthophoto', region.directory, file + '.versatiles');
		if (!existsSync(srcPath)) continue;
		const srcUrl = `${remoteURL}orthophoto/${region.directory}/${file}.versatiles`;
		constainers.push(`from_container filename="${srcUrl}" | raster_overscale`);
	}
}
constainers.length=1;
constainers.push(`from_container filename="${remoteURL}download/satellite/satellite.versatiles" | raster_overscale`);

const vpl = `from_stacked_raster [
  ${constainers.join(',\n  ')}
]
  | filter level_max=19
  | meta_update attribution="Various sources"`

Deno.writeTextFileSync(resolve(serverDir, 'sat.vpl'), vpl);