import { bashStep, defineRegion } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { join } from 'node:path';

export default defineRegion(
	'ch',
	{
		status: 'success',
		notes: [
			'You have to use an undocumented API to get a constantly changing URL for a CSV file that contains the URLs for the actual tiles.',
			'License requires attribution.',
			'National license instead of an international standard.',
		],
		entries: ['tiles'],
		license: {
			name: 'Open Government Data (OGD)',
			url: 'https://www.swisstopo.admin.ch/de/nutzungsbedingungen-kostenlose-geodaten-und-geodienste',
			requiresAttribution: true,
		},
		creator: {
			name: 'Bundesamt für Landestopografie swisstopo',
			url: 'https://www.swisstopo.admin.ch/de/orthobilder-swissimage-10-cm',
		},
		date: '2017-2024',
		vrt: { defaults: { ext: 'tif', useFileList: true } },
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
