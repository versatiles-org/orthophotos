import { bashStep, defineRegion } from '../framework.ts';
import { expectMinFiles } from '../validators.ts';
import { join } from 'node:path';

export default defineRegion(
	'ro',
	{
		status: 'success',
		notes: ['Images are unnecessarily packed into container files, such as ZIP.', 'License requires attribution.'],
		entries: ['tiles'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'Agenția de Informații Geospațiale a Apărării',
			url: 'https://data.gov.ro/en/dataset/ortofotoplan-scara-1-5000-pentru-teritoriul-romaniei',
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
