import { resolve } from '@std/path/resolve';
import { scanRegions, updateRegionEntries } from './status/regions.ts';
import { loadKnownRegions } from './status/geojson.ts';


const knownRegions = loadKnownRegions(resolve(import.meta.dirname!, '../data'));
const regions = scanRegions(resolve(import.meta.dirname!, '../regions'), knownRegions);
updateRegionEntries(regions);

const result = JSON.stringify(regions);
Deno.writeTextFileSync(resolve(import.meta.dirname!, '../web/status.json'), result);
console.log(`Wrote ${regions.length} regions to web/status.json`);
