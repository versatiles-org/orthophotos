/**
 * The settlement-proximity PNG that chooses the WebP quality within the ranges of `QUALITY`
 * (`versatiles --quality-map`). See `docs/quality-zones.md`.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getConfig } from './config.ts';

/** File name of the map in `dir_data`, where `npm run build:quality-zones` writes it. */
export const QUALITY_MAP_FILE = 'settlement_proximity.png';

/** Where the map is expected: `<dir_data>/settlement_proximity.png`. */
export function getQualityMapPath(): string {
	return join(getConfig().dirData, QUALITY_MAP_FILE);
}

/**
 * The path of the map, for `--quality-map`. Throws if it is missing, rather than letting `versatiles`
 * refuse the ranges in `QUALITY` after the download.
 */
export function requireQualityMap(): string {
	const path = getQualityMapPath();
	if (!existsSync(path)) {
		throw new Error(
			`The quality map "${path}" is missing. Build it with "npm run build:quality-zones -- <osm.versatiles>" ` +
				`or copy it there; see docs/quality-zones.md.`,
		);
	}
	return path;
}
