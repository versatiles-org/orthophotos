import { bashStep, defineRegion } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { join } from 'node:path';

export default defineRegion(
	'de/brandenburg',
	{
		status: 'success',
		notes: [
			'No API, such as an ATOM feed, available.',
			'Parsing HTML is required.',
			'Images are unnecessarily packed into container files, such as ZIP.',
			'Server is very slow.',
			'License requires attribution.',
			'National license instead of an international standard.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
		entries: ['tiles'],
		license: {
			name: 'DL-DE->BY-2.0',
			url: 'https://www.govdata.de/dl-de/by-2-0',
			requiresAttribution: true,
		},
		creator: {
			name: 'GeoBasis-DE/LGB; Geoportal Berlin',
			url: 'https://data.geobasis-bb.de/geobasis/daten/dop/rgb_jpg/',
		},
	},
	[
		bashStep('fetch', {
			scriptFile: '1_fetch.sh',
			validate: async (ctx) => {
				await expectMinFiles(join(ctx.dataDir, 'tiles'), '*.jpg', 50);
			},
		}),
	],
);
