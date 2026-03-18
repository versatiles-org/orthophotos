import { bashStep, defineRegion } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { join } from 'node:path';

export default defineRegion(
	'de/baden_wuerttemberg',
	{
		status: 'success',
		notes: [
			'No API, such as an ATOM feed, available.',
			'Hacky solution is required: Guessing filenames since there is no official index.',
			'Images are unnecessarily packed into container files, such as ZIP.',
			'Why are 1x1km tiles grouped into 2x2km containers? And why are the offsets not a multiple of 2?',
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
			name: 'LGL, www.lgl-bw.de',
			url: 'https://www.lgl-bw.de/Produkte/Luftbildprodukte/DOP20/',
		},
		vrt: {},
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
