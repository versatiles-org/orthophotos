import { dirname, relative, resolve } from 'node:path';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { getConfig } from '../config.ts';
import { getAllRegionMetadata } from '../regions/index.ts';
import { loadKnownRegions } from '../status/geojson.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '../../data');

/**
 * Generates a VersaTiles Pipeline Language (VPL) configuration file.
 * Stacks orthophoto containers (via sftp) from all successful regions onto satellite imagery.
 * Uses GeoJSON masks (from NUTS or custom files) to cleanly clip the raster data at region borders.
 * @param outputDir - Directory to write VPL and mask files into
 * @param filename - Output filename for the VPL file
 * @param debug - If true, shows all orthophoto layers with level_min = 0 for debugging purposes.
 */
export function generateVPL(outputDir: string, filename: string, debug = false): void {
	const { host, port, dir } = getConfig().ssh!;

	function sftpUrl(path: string): string {
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

		const entries = meta.entries ?? ['result'];
		for (const entry of entries) {
			let layer = `from_container filename="${sftpUrl(`${dir}/${id}/${entry}.versatiles`)}"`;

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
	}

	// Add satellite base layers via sftp
	layers.push(`from_container filename="${sftpUrl('/home/satellite/s2gm/s2gm_overview.versatiles')}"`);
	layers.push(
		`from_container filename="${sftpUrl('/home/satellite/bluemarble/bluemarble.versatiles')}" | raster_levels gamma=0.8 brightness=0.2 contrast=0.8`,
	);

	const vpl = `from_stacked_raster auto_overscale=true [
  ${layers.join(',\n  ')}
] | meta_update
  name="VersaTiles - Satellite + Orthophotos"
  description="High-resolution satellite and orthophoto imagery from various providers, merged by VersaTiles."
  schema="rgb"
  attribution="<a href='https://versatiles.org/sources/'>VersaTiles sources</a>"
`;

	writeFileSync(resolve(outputDir, filename), vpl);
	console.log(`Wrote VPL with ${layers.length - 2} orthophoto layers to ${filename}`);
}
