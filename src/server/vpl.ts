import { dirname, relative, resolve } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { getConfig } from '../lib/index.ts';
import { getAllRegionMetadata } from '../regions/index.ts';
import { loadKnownRegions } from '../status/index.ts';
import { getCoastlineLayers, getCoastlinePath } from './coastline.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../../data');

/**
 * `raster_levels` for Blue Marble, which shows only at sea. Fitted on the whole globe at zoom 3:
 * its ocean gets the mean HSV saturation of the satellite land (0.28 instead of 0.86) and a mean
 * luma of 80, darker than the land (115). Needs versatiles with `saturation` (versatiles-rs#328).
 */
export const BLUEMARBLE_LEVELS = 'saturation=0.65 brightness=65 gamma=1.1';

export interface VPLOptions {
	/** If true, shows all orthophoto layers with level_min = 0 for debugging. */
	debug?: boolean;
	/** When set, VPL references local files instead of SFTP URLs. Orthophoto sources at {localDir}/regions/, satellite at {localDir}/satellite/. */
	localDir?: string;
	/** Land polygons for the coastline mask of the satellite layer. Defaults to `getCoastlinePath()`; call `ensureCoastline()` before converting the VPL. */
	coastline?: string;
}

/**
 * Generates a VersaTiles Pipeline Language (VPL) configuration file.
 * Stacks orthophoto containers from all successful regions onto satellite imagery.
 * Uses GeoJSON masks (from NUTS or custom files) to cleanly clip the raster data at region borders.
 * @param outputDir - Directory to write VPL and mask files into
 * @param filename - Output filename for the VPL file
 * @param options - VPL generation options
 */
export function generateVPL(outputDir: string, filename: string, options: VPLOptions | boolean = {}): void {
	// Support legacy boolean parameter for debug
	if (typeof options === 'boolean') options = { debug: options };
	const { debug = false, localDir, coastline = getCoastlinePath() } = options;

	const ssh = getConfig().ssh;

	function sourceUrl(path: string): string {
		if (localDir) {
			return resolve(localDir, path);
		}
		if (!ssh) throw new Error('SSH configuration is required for VPL generation without localDir.');
		const { host, port } = ssh;
		path = path.replace(/\/\/+/g, '/');
		if (!path.startsWith('/')) path = '/' + path;
		return `sftp://${host}:${port ?? ''}${path}`;
	}

	mkdirSync(outputDir, { recursive: true });
	const masksDir = resolve(outputDir, 'masks');
	mkdirSync(masksDir, { recursive: true });

	// Lazy-load NUTS regions only when needed
	let nutsRegions: ReturnType<typeof loadKnownRegions> | undefined;
	function getNutsRegions() {
		if (!nutsRegions) nutsRegions = loadKnownRegions(DATA_DIR);
		return nutsRegions;
	}

	const layers: string[] = [];
	const allMetadata = getAllRegionMetadata();
	const levelMin = debug ? 0 : 11;

	for (const [id, meta] of allMetadata) {
		if (meta.status !== 'released') continue;

		const containerPath = localDir ? `regions/${id}.versatiles` : `${ssh!.dir}/${id}.versatiles`;
		let layer = `from_container filename="${sourceUrl(containerPath)}"`;

		if (meta.mask) {
			const maskId = id.replace(/\//g, '_');
			const maskPath = resolve(masksDir, `${maskId}.geojson`);

			if (meta.mask === true) {
				// Use region geometry from NUTS TopoJSON
				const region = getNutsRegions().find((r) => r.properties.id === id);
				if (!region) {
					throw new Error(`No NUTS geometry found for region '${id}'`);
				}
				const fc = {
					type: 'FeatureCollection',
					features: [{ type: 'Feature', geometry: region.geometry, properties: {} }],
				};
				const geojson = JSON.stringify(fc);
				writeFileSync(maskPath, geojson);
			} else {
				// Use custom .geojson.gz file from data/
				const gzPath = resolve(DATA_DIR, meta.mask);
				const geojson = gunzipSync(readFileSync(gzPath)).toString('utf-8');
				writeFileSync(maskPath, geojson);
			}

			const buffer = meta.maskBuffer ?? 0;
			layer += ` | raster_mask geojson="${relative(outputDir, maskPath)}"`;
			if (buffer !== 0) layer += ` buffer=${buffer}`;
		}

		layer += ` | filter level_min=${levelMin}`;
		layers.push(layer);
	}

	// Add satellite base layers
	const s2gmPath = localDir
		? 'satellite/s2gm/s2gm_overview.versatiles'
		: '/home/satellite/s2gm/s2gm_overview.versatiles';
	const bluemarblePath = localDir
		? 'satellite/bluemarble/bluemarble.versatiles'
		: '/home/satellite/bluemarble/bluemarble.versatiles';
	// The satellite layer shows on land and in a strip of coastal water; Blue Marble shows the sea.
	const satelliteLayers = getCoastlineLayers(sourceUrl(s2gmPath), resolve(coastline));
	layers.push(...satelliteLayers);
	// Blue Marble's ocean, toned to the saturation of the satellite land, see "Blue Marble's levels" in docs/satellite.md.
	layers.push(`from_container filename="${sourceUrl(bluemarblePath)}" | raster_levels ${BLUEMARBLE_LEVELS}`);

	const vpl = `from_stacked_raster auto_overscale=true [
  ${layers.join(',\n  ')}
] | meta_update
  name="VersaTiles Satellite + Orthophotos"
  description="High-resolution satellite and orthophoto imagery from various providers, merged by VersaTiles."
  schema="rgb"
  attribution="<a href='https://versatiles.org/sources/'>VersaTiles sources</a>"
`;

	writeFileSync(resolve(outputDir, filename), vpl);
	console.log(`Wrote VPL with ${layers.length - satelliteLayers.length - 1} orthophoto layers to ${filename}`);
}
