import { bashStep, defineRegion } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { join } from 'node:path';

export default defineRegion(
	'nl',
	{
		status: 'success',
		notes: ['License requires attribution.'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'beeldmateriaal.nl',
			url: 'https://www.beeldmateriaal.nl/dataroom',
		},
		date: '2025',
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
