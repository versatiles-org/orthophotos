import { resolve } from '@std/path/resolve';
import { scanRegions } from './status/regions.ts';
import { loadKnownRegions } from './status/geojson.ts';

const knownRegions = loadKnownRegions(resolve(import.meta.dirname!, '../data'));

scanRegions(resolve(import.meta.dirname!, '../regions'), knownRegions);
