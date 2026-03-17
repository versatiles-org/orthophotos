import { bashStep, defineRegion } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { join } from 'node:path';

export default defineRegion(
	'de/bremen',
	{
		status: 'success',
		notes: [
			'No API, such as an ATOM feed, available.',
			'Images are unnecessarily packed into container files, such as ZIP.',
			'License requires attribution.',
			'JPEGs with World files are provided, but not more convenient GeoTIFFs/JPEG2000.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
		entries: ['tiles_hb', 'tiles_bhv'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'Landesamt GeoInformation Bremen',
			url: 'https://metaver.de/trefferanzeige?cmd=doShowDocument&docuuid=910260F7-AC66-40F3-8BA2-E7108C3C71C9',
		},
	},
	[
		bashStep('fetch', {
			scriptFile: '1_fetch.sh',
			validate: async (ctx) => {
				await expectMinFiles(join(ctx.dataDir, 'tiles_hb'), '*.jpg', 10);
			},
		}),
	],
);
