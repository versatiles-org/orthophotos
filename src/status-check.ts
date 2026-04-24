import { resolve, dirname } from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { scanRegions } from './status/regions.ts';
import { loadKnownRegions } from './status/geojson.ts';
import { getAggregatedRegionMetadata } from './regions/index.ts';
import { generateStatusPage } from './status/html.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const knownRegions = loadKnownRegions(resolve(__dirname, '../data'));

const allMetadata = getAggregatedRegionMetadata();

const regions = scanRegions(knownRegions, allMetadata);

writeFileSync(resolve(__dirname, '../web/status.json'), JSON.stringify(regions));
console.log(`Wrote ${regions.length} regions to web/status.json`);

const sources = regions.map((region) => ({
	id: region.id,
	status: region.status,
	name: region.region.properties,
}));
writeFileSync(resolve(__dirname, '../web/sources.json'), JSON.stringify(sources, null, 2));

const knownRegionMap = new Map(knownRegions.map((r) => [r.properties.id, r]));
const html = generateStatusPage(allMetadata, knownRegionMap);
writeFileSync(resolve(__dirname, '../web/index.html'), html);
console.log(`Wrote status page with ${allMetadata.size} regions to web/index.html`);
