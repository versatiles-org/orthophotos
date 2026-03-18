import { bashStep, defineRegion } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { join } from 'node:path';

export default defineRegion(
	'de/hessen',
	{
		status: 'success',
		notes: [
			'Server is slow.',
			'National license instead of an international standard.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
		entries: ['tiles'],
		license: {
			name: 'DL-DE->Zero-2.0',
			url: 'https://www.govdata.de/dl-de/zero-2-0',
			requiresAttribution: false,
		},
		creator: {
			name: 'Hessisches Landesamt für Bodenmanagement und Geoinformation',
			url: 'https://www.geoportal.hessen.de/mapbender/php/mod_showMetadata.php?resource=layer&layout=tabs&redirectToMetadataUrl=1&id=54936',
		},
		vrt: { defaults: { useFileList: true } },
	},
	[
		bashStep('fetch', {
			scriptFile: '1_fetch.sh',
			validate: async (ctx) => {
				await expectMinFiles(join(ctx.dataDir, 'tiles'), '*.jp2', 50);
			},
		}),
	],
);
