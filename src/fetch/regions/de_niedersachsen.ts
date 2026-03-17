import { bashStep, defineRegion } from '../framework.ts';
import { expectMinFiles } from '../validators.ts';
import { join } from 'node:path';

export default defineRegion(
	'de/niedersachsen',
	{
		status: 'success',
		notes: [
			'License requires attribution.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
		entries: ['tiles'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'GeoBasis-DE/LGLN, 2025',
			url: 'https://ni-lgln-opengeodata.hub.arcgis.com/apps/lgln-opengeodata::digitales-orthophoto-dop/about',
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
