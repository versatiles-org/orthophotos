import { bashStep, defineRegion } from '../framework.ts';
import { expectMinFiles } from '../validators.ts';
import { join } from 'node:path';

export default defineRegion(
	'at',
	{
		status: 'error',
		notes: [
			"Images are upside down, and 'gdalbuildvrt' does not support positive NS resolution.",
			'License requires attribution.',
		],
		entries: ['tiles'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'BEV',
			url: 'https://data.bev.gv.at/geonetwork/srv/api/records/3c3803b3-1b53-4fb5-9595-9217b9891862',
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
