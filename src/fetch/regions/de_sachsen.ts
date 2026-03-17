import { bashStep, defineRegion } from '../framework.ts';
import { expectMinFiles } from '../validators.ts';
import { join } from 'node:path';

export default defineRegion(
	'de/sachsen',
	{
		status: 'success',
		notes: [
			'The URLs in the Atom feed point to old files that no longer exist.',
			'Images are unnecessarily packed into container files, such as ZIP.',
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
			name: 'GeoSN',
			url: 'https://www.geodaten.sachsen.de/luftbild-produkte-3995.html',
		},
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
