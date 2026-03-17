import { bashStep, defineRegion } from '../framework.ts';
import { expectFile } from '../validators.ts';
import { join } from 'node:path';

export default defineRegion(
	'li',
	{
		status: 'success',
		notes: ['License requires attribution.'],
		entries: ['tiles'],
		license: {
			name: 'CC BY 4.0',
			url: 'https://creativecommons.org/licenses/by/4.0/',
			requiresAttribution: true,
		},
		creator: {
			name: 'Amt für Tiefbau und Geoinformation',
			url: 'https://www.opendata.li/de/daten#esc_entry=159&esc_context=24',
		},
	},
	[
		bashStep('fetch', {
			scriptFile: '1_fetch.sh',
			validate: async (ctx) => {
				await expectFile(join(ctx.dataDir, 'tiles', 'image.tif'));
			},
		}),
	],
);
