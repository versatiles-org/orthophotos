#!/usr/bin/env node

/**
 * Builds the quality-zones GeoJSON (EPSG:3857) from an OSM planet or extract.
 * See `docs/quality-zones.md`.
 *
 * Usage: npm run build:quality-zones -- <input.osm.pbf> [output.geojson]
 * The output defaults to `<dir_data>/quality_zones.geojson`.
 * Intermediate files go to `<dir_temp>/quality_zones/` and are reused on the next run.
 */

import { join, resolve } from 'node:path';
import { getConfig } from './lib/index.ts';
import { buildQualityZones } from './quality-zones/index.ts';

const [input, output] = process.argv.slice(2);
if (!input) {
	console.error('Usage: npm run build:quality-zones -- <input.osm.pbf> [output.geojson]');
	process.exit(1);
}

const config = getConfig();
await buildQualityZones(
	resolve(input),
	resolve(output ?? join(config.dirData, 'quality_zones.geojson')),
	join(config.dirTemp, 'quality_zones'),
);
