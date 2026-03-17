import { bashStep, defineRegion } from '../framework.ts';
import { expectMinFiles } from '../validators.ts';
import { join } from 'node:path';

export default defineRegion(
	'pl',
	{
		status: 'error',
		notes: [
			'No bulk download available.',
			'Only WMS available.',
			'Server is very, very slow.',
			'Unknown license.',
			'Server returns errors.',
		],
		entries: ['tiles'],
		license: {
			name: 'Unknown',
			url: 'https://www.geoportal.gov.pl/en/data/orthophotomap-orto/',
			requiresAttribution: false,
		},
		creator: {
			name: 'Główny Urząd Geodezji i Kartografii',
			url: 'https://www.geoportal.gov.pl/en/data/orthophotomap-orto/',
		},
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
