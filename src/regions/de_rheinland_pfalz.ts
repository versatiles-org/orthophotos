import { bashStep, defineRegion } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { join } from 'node:path';

export default defineRegion(
	'de/rheinland_pfalz',
	{
		status: 'success',
		notes: [
			'No API, such as an ATOM feed, available.',
			'Parsing HTML is required.',
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
			name: 'GeoBasis-DE / LVermGeoRP 2025, www.lvermgeo.rlp.de',
			url: 'https://geoshop.rlp.de/opendata-dop20.html',
		},
	},
	[
		bashStep('fetch', {
			scriptFile: '1_fetch.sh',
			validate: async (ctx) => {
				await expectMinFiles(join(ctx.dataDir, 'tiles'), '*', 50);
			},
		}),
	],
);
