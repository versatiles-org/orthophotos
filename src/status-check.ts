import { resolve } from '@std/path/resolve';
import { scanRegions, updateRegionEntries } from './status/regions.ts';
import { loadKnownRegions } from './status/geojson.ts';

const knownRegions = loadKnownRegions(resolve(import.meta.dirname!, '../data'));

const regions = scanRegions(resolve(import.meta.dirname!, '../regions'), knownRegions);
await updateRegionEntries(regions);

Deno.writeTextFileSync(
	resolve(import.meta.dirname!, '../web/status.json'),
	JSON.stringify(regions),
);
console.log(`Wrote ${regions.length} regions to web/status.json`);

const sources = regions.map((region) => ({
	id: region.id,
	status: region.status,
	name: region.region.properties,
}));
Deno.writeTextFileSync(
	resolve(import.meta.dirname!, '../web/sources.json'),
	JSON.stringify(sources, null, 2),
);
