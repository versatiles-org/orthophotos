import { bashStep, defineRegion } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { join } from 'node:path';

export default defineRegion(
	'fr',
	{
		status: 'success',
		notes: [
			'No API, such as an ATOM feed, available.',
			'Parsing HTML is required.',
			'Images are unnecessarily packed into container files, such as 7ZIP.',
			'The images have a high resolution, but they are not stored in tiled mode, which makes them extremely slow to read.',
			'National license instead of an international standard.',
		],
		license: {
			name: 'LO 2.0',
			url: 'https://www.data.gouv.fr/datasets/licence-ouverte-2-0',
			requiresAttribution: true,
		},
		creator: {
			name: "Institut national de l'information géographique et forestière (IGN-F)",
			url: 'https://geoservices.ign.fr/documentation/donnees/ortho/bdortho',
		},
		date: '2024',
	},
	[
		bashStep('fetch', {
			scriptFile: '1_fetch.sh',
			validate: async (ctx) => {
				await expectMinFiles(join(ctx.dataDir, 'tiles_lcc'), '*.jp2', 50);
			},
		}),
	],
);
