import { resolve, dirname } from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanRegions, updateRegionEntries } from './status/regions.ts';
import { loadKnownRegions } from './status/geojson.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const knownRegions = loadKnownRegions(resolve(__dirname, '../data'));

const regions = scanRegions(resolve(__dirname, '../regions'), knownRegions);
await updateRegionEntries(regions);

writeFileSync(
	resolve(__dirname, '../web/status.json'),
	JSON.stringify(regions),
);
console.log(`Wrote ${regions.length} regions to web/status.json`);

const sources = regions.map((region) => ({
	id: region.id,
	status: region.status,
	name: region.region.properties,
}));
writeFileSync(
	resolve(__dirname, '../web/sources.json'),
	JSON.stringify(sources, null, 2),
);
