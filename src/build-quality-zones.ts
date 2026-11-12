#!/usr/bin/env node

/**
 * Builds the settlement-proximity PNG (one pixel per zoom-14 tile) from the VersaTiles OSM vector tiles.
 * See `docs/quality-zones.md`.
 *
 * Usage: npm run build:quality-zones -- <osm.versatiles> [output.png]
 * The input is a local path or a URL. The output defaults to `<dir_data>/settlement_proximity.png`.
 * Intermediate files go to `<dir_temp>/quality_zones/` and are reused on the next run.
 */

import { join, resolve } from 'node:path';
import { getConfig } from './lib/index.ts';
import { buildQualityZones, isUrl } from './quality-zones/index.ts';

const [input, output] = process.argv.slice(2);
if (!input) {
	console.error('Usage: npm run build:quality-zones -- <osm.versatiles> [output.png]');
	process.exit(1);
}

const config = getConfig();
await buildQualityZones(
	isUrl(input) ? input : resolve(input),
	resolve(output ?? join(config.dirData, 'settlement_proximity.png')),
	join(config.dirTemp, 'quality_zones'),
);
