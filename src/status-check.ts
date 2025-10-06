import { resolve } from '@std/path/resolve';
import { scanRegions } from './status/regions.ts';

const regions_directory = resolve(import.meta.dirname!, '../regions');
scanRegions(regions_directory);
