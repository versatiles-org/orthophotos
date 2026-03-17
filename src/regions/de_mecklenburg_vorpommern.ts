import { bashStep, defineRegion } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { join } from 'node:path';

export default defineRegion(
	'de/mecklenburg_vorpommern',
	{
		status: 'success',
		notes: [
			'Server is slow.',
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
			name: 'GeoBasis-DE/M-V',
			url: 'https://www.geoportal-mv.de/portal/Suche/Metadatenuebersicht/Details/Downloaddienst%20Digitale%20Orthophotos%2020cm%20MV%20(ATOM_MV_DOP)/0dea084c-5d2f-4aa0-a974-481dcd85a0ab',
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
