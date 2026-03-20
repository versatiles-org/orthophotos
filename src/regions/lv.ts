import { bashStep, defineRegion } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { join } from 'node:path';

export default defineRegion(
	'lv',
	{
		status: 'success',
		notes: ['License requires attribution.'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'Latvijas Ģeotelpiskās informācijas aģentūra',
			url: 'https://www.lgia.gov.lv/lv/aerofotografesanas-6-cikls-2016-2018-g',
		},
		date: '2016-2018',
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
