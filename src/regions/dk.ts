import { bashStep, defineRegion } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { join } from 'node:path';

export default defineRegion(
	'dk',
	{
		status: 'success',
		notes: ['License requires attribution', 'Only WMS available', 'Access requires token'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'GeoDanmark',
			url: 'https://dataforsyningen.dk/data/981',
		},
		date: '2024',
	},
	[
		bashStep('fetch', {
			scriptFile: '1_fetch.sh',
			validate: async (ctx) => {
				await expectMinFiles(join(ctx.dataDir, 'tiles'), '*.jp2', 10);
			},
		}),
	],
);
