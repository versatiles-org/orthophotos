import { bashStep, defineRegion } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { join } from 'node:path';

export default defineRegion(
	'sk',
	{
		status: 'error',
		notes: ['Images are unnecessarily packed into container files, such as ZIP.', 'License requires attribution.'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'GKÚ',
			url: 'https://rpi.gov.sk/metadata/3b046df1-7867-4377-b15b-6ae6bac999da',
		},
		date: '2023',
	},
	[
		bashStep('fetch', {
			scriptFile: '1_fetch.sh',
			validate: async (ctx) => {
				await expectMinFiles(join(ctx.dataDir, 'tiles'), '*.tif', 50);
			},
		}),
	],
);
