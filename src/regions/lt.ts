import { bashStep, defineRegion } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { join } from 'node:path';

export default defineRegion(
	'lt',
	{
		status: 'success',
		notes: [
			'Atom feed provides only proprietary data formats.',
			'Only WMS is usable.',
			'Server is very, very slow.',
			'No license information found.',
		],
		entries: ['tiles'],
		license: {
			name: 'CC0',
			url: 'https://creativecommons.org/publicdomain/zero/1.0/',
			requiresAttribution: false,
		},
		creator: {
			name: 'Nacionalinė žemės tarnyba prie Aplinkos ministerijos',
			url: 'https://www.geoportal.lt/geoportal/paieska',
		},
		date: '2019',
		vrt: {},
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
