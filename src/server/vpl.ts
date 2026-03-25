import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { config } from '../config.ts';
import { getAllRegionMetadata } from '../regions/index.ts';

/**
 * Generates a VersaTiles Pipeline Language (VPL) configuration file.
 * Stacks orthophoto containers (via sftp) from all successful regions onto satellite imagery.
 * @param filename - Output filename for the VPL file (relative to data directory)
 */
export function generateVPL(filename: string) {
	const { host, port, dir } = config.ssh!;

	function sftpUrl(path: string): string {
		path = path.replace(/\/\/+/g, '/');
		if (!path.startsWith('/')) path = '/' + path;

		return `sftp://${host}:${port ?? ''}${path}`;
	}

	const layers: string[] = [];

	// Add orthophoto layers for all successful regions via sftp
	const allMetadata = getAllRegionMetadata();
	for (const [id, meta] of allMetadata) {
		if (meta.status !== 'released') continue;

		const entries = meta.entries ?? ['result'];
		for (const entry of entries) {
			layers.push(`from_container filename="${sftpUrl(`${dir}/${id}/${entry}.versatiles`)}" | filter level_min=11`);
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

	writeFileSync(resolve(config.dirData, filename), vpl);
	console.log(`Wrote VPL with ${layers.length - 2} orthophoto layers to ${filename}`);
}
