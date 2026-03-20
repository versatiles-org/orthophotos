import { join } from 'node:path';
import { bashStep, defineRegion } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';

export default defineRegion(
	'cz',
	{
		status: 'success',
		notes: ['License requires attribution.'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'ČÚZK',
			url: 'https://geoportal.cuzk.gov.cz/(S(zggl1k35qp1wg4q33q1a5gov))/Default.aspx?mode=TextMeta&text=ortofoto_info&side=ortofoto',
		},
		date: '2024-2025',
	},
	[
		bashStep('fetch', {
			scriptFile: '1_fetch.sh',
			validate: async (ctx) => {
				await expectMinFiles(join(ctx.dataDir, 'tiles_rgb'), '*.jp2', 50);
			},
		}),
	],
);
