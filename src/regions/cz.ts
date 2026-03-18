import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { bashStep, defineRegion } from '../lib/framework.ts';
import { runCommand } from '../lib/command.ts';
import { expectMinFiles } from '../lib/validators.ts';

export default defineRegion(
	'cz',
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
			name: 'ČÚZK',
			url: 'https://geoportal.cuzk.gov.cz/(S(zggl1k35qp1wg4q33q1a5gov))/Default.aspx?mode=TextMeta&text=ortofoto_info&side=ortofoto',
		},
		date: '2024-2025',
		vrt: {
			custom: async (ctx) => {
				const rgbFiles = (await readdir(join(ctx.dataDir, 'tiles_rgb'))).filter((f) => f.endsWith('.jp2')).sort();
				const rgbListPath = join(ctx.tempDir, 'tiles_rgb_files.txt');
				await writeFile(rgbListPath, rgbFiles.map((f) => `tiles_rgb/${f}`).join('\n'));

				const alphaFiles = (await readdir(join(ctx.dataDir, 'tiles_alpha'))).filter((f) => f.endsWith('.jp2')).sort();
				const alphaListPath = join(ctx.tempDir, 'tiles_alpha_files.txt');
				await writeFile(alphaListPath, alphaFiles.map((f) => `tiles_alpha/${f}`).join('\n'));

				const rgbVrt = join(ctx.dataDir, 'tiles_rgb.vrt');
				const alphaVrt = join(ctx.dataDir, 'tiles_alpha.vrt');
				const tilesVrt = join(ctx.dataDir, 'tiles.vrt');

				await runCommand(
					'gdalbuildvrt',
					['-b', '1', '-b', '2', '-b', '3', '-a_srs', 'EPSG:3045', rgbVrt, '-input_file_list', rgbListPath],
					{ cwd: ctx.dataDir },
				);
				await runCommand(
					'gdalbuildvrt',
					['-b', '1', '-a_srs', 'EPSG:3045', alphaVrt, '-input_file_list', alphaListPath],
					{ cwd: ctx.dataDir },
				);
				await runCommand('gdalbuildvrt', ['-separate', tilesVrt, rgbVrt, alphaVrt], { cwd: ctx.dataDir });

				await runCommand(
					'xmlstarlet',
					[
						'ed',
						'-L',
						'-s',
						"/VRTDataset/VRTRasterBand[@band='1'][not(ColorInterp)]",
						'-t',
						'elem',
						'-n',
						'ColorInterp',
						'-v',
						'Red',
						'-s',
						"/VRTDataset/VRTRasterBand[@band='2'][not(ColorInterp)]",
						'-t',
						'elem',
						'-n',
						'ColorInterp',
						'-v',
						'Green',
						'-s',
						"/VRTDataset/VRTRasterBand[@band='3'][not(ColorInterp)]",
						'-t',
						'elem',
						'-n',
						'ColorInterp',
						'-v',
						'Blue',
						'-s',
						"/VRTDataset/VRTRasterBand[@band='4'][not(ColorInterp)]",
						'-t',
						'elem',
						'-n',
						'ColorInterp',
						'-v',
						'Alpha',
						tilesVrt,
					],
					{ cwd: ctx.dataDir },
				);
			},
		},
	},
	[
		bashStep('fetch', {
			scriptFile: '1_fetch.sh',
			validate: async (ctx) => {
				await expectMinFiles(join(ctx.dataDir, 'tiles_rgb'), '*.jp2', 50);
			},
		}),
	],
);
