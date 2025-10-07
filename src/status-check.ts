import { resolve } from '@std/path/resolve';
import { scanProcessedRegions } from './status/regions.ts';
import { loadKnownRegions } from './status/geojson.ts';

const knownRegions = loadKnownRegions(resolve(import.meta.dirname!, '../data'));

scanProcessedRegions(resolve(import.meta.dirname!, '../regions'), knownRegions);
