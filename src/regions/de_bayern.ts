import { bashStep, defineRegion } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { join } from 'node:path';

export default defineRegion(
	'de/bayern',
	{
		status: 'success',
		notes: [
			'No API, such as an ATOM feed, available.',
			'A hacky solution is required: Parse gemeinde.kml in the hope that it is up to date and references all images.',
			'License requires attribution.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
		entries: ['tiles'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'Bayerische Vermessungsverwaltung - www.geodaten.bayern.de',
			url: 'https://geodaten.bayern.de/opengeodata/OpenDataDetail.html?pn=dop20rgb',
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
