import { readFile, writeFile } from 'node:fs/promises';
import { bashStep, defineRegion } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { join } from 'node:path';

export default defineRegion(
	'de/hamburg',
	{
		status: 'success',
		notes: [
			'No API, such as an ATOM feed, available.',
			'Images are unnecessarily packed into container files, such as ZIP.',
			'License requires attribution.',
			'National license instead of an international standard.',
			'Rather than a national mosaic, inconsistent regional mosaics with different access and formats are available instead.',
		],
		entries: ['tiles'],
		license: {
			name: 'DL-DE->BY-2.0',
			url: 'https://www.govdata.de/dl-de/by-2-0',
			requiresAttribution: true,
		},
		creator: {
			name: 'Freie und Hansestadt Hamburg, Landesbetrieb Geoinformation und Vermessung (LGV)',
			url: 'https://metaver.de/trefferanzeige?docuuid=5DF0990B-9195-41E7-9960-9214BC85B4DA',
		},
		vrt: {
			defaults: { ext: 'tif', bands: [1, 2, 3] },
			postProcess: async (_ctx, _entry, vrtPath) => {
				const content = await readFile(vrtPath, 'utf-8');
				const patched = content.replace(/<\/ScaleRatio>/g, '</ScaleRatio>\n      <UseMaskBand>true</UseMaskBand>');
				await writeFile(vrtPath, patched);
			},
		},
	},
	[
		bashStep('fetch', {
			scriptFile: '1_fetch.sh',
			validate: async (ctx) => {
				await expectMinFiles(join(ctx.dataDir, 'tiles'), '*.tif', 10);
			},
		}),
	],
);
