import { dirname, relative, resolve } from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from '../config.ts';
import { getAllRegionMetadata } from '../regions/index.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GEOJSON_DIR = resolve(__dirname, '../../data');

/**
 * Generates a VersaTiles Pipeline Language (VPL) configuration file.
 * Stacks orthophoto containers (via sftp) from all successful regions onto satellite imagery.
 * Uses GeoJSON mask files from data/ to cleanly clip the raster data at region borders.
 * @param filename - Output filename for the VPL file (relative to data directory)
 * @param debug - If true, shows all orthophoto layers with level_min = 0 for debugging purposes.
 */
export function generateVPL(filename: string, debug = false): void {
	const { host, port, dir } = config.ssh!;

	function sftpUrl(path: string): string {
		path = path.replace(/\/\/+/g, '/');
		if (!path.startsWith('/')) path = '/' + path;
		return `sftp://${host}:${port ?? ''}${path}`;
	}

	const dataDir = resolve(config.dirData);
	const masksDir = resolve(dataDir, 'masks');
	mkdirSync(masksDir, { recursive: true });

	const layers: string[] = [];
	const allMetadata = getAllRegionMetadata();
	const levelMin = debug ? 0 : 11;

	for (const [id, meta] of allMetadata) {
		if (meta.status !== 'released') continue;

		const entries = meta.entries ?? ['result'];
		for (const entry of entries) {
			let layer = `from_container filename="${sftpUrl(`${dir}/${id}/${entry}.versatiles`)}"`;

			// Check for a high-accuracy GeoJSON mask in data/
			const maskId = id.replace(/\//g, '_');
			const gzPath = resolve(GEOJSON_DIR, `${maskId}.geojson.gz`);
			if (existsSync(gzPath)) {
				const maskPath = resolve(masksDir, `${maskId}.geojson`);
				const geojson = gunzipSync(readFileSync(gzPath)).toString('utf-8');
				writeFileSync(maskPath, geojson);
				const buffer = meta.maskBuffer ?? 0;
				layer += ` | raster_mask geojson="${relative(dataDir, maskPath)}"`;
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

	writeFileSync(resolve(dataDir, filename), vpl);
	console.log(`Wrote VPL with ${layers.length - 2} orthophoto layers to ${filename}`);
}
