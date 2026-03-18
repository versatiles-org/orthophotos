import { existsSync, mkdirSync, rmSync, renameSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineRegion, step } from '../lib/framework.ts';
import { expectMinFiles } from '../lib/validators.ts';
import { shuffle } from '../lib/array.ts';
import { runCommand } from '../lib/command.ts';
import { CONCURRENCY, concurrent } from '../lib/concurrent.ts';
import { withRetry } from '../lib/retry.ts';

const INDEX_URL = 'https://geobasis-rlp.de/data/dop20rgb/current/jp2/';

export function parseFilenames(html: string): string[] {
	const pattern = /href="([^"]+\.jp2)"/g;
	const filenames: string[] = [];
	let match;
	while ((match = pattern.exec(html)) !== null) {
		filenames.push(match[1]);
	}
	return filenames;
}

export default defineRegion(
	'de/rheinland_pfalz',
	{
		status: 'success',
		notes: [
			'No API, such as an ATOM feed, available.',
			'Parsing HTML is required.',
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
			name: 'GeoBasis-DE / LVermGeoRP 2025, www.lvermgeo.rlp.de',
			url: 'https://geoshop.rlp.de/opendata-dop20.html',
		},
		vrt: {},
	},
	[
		step('fetch-index', async (ctx) => {
			const indexPath = join(ctx.tempDir, 'index.html');
			if (!existsSync(indexPath)) {
				console.log('  Fetching index...');
				// -k for insecure SSL
				await withRetry(() => runCommand('curl', ['-sko', indexPath, INDEX_URL]), { maxAttempts: 3 });
			}

			const html = await readFile(indexPath, 'utf-8');
			const filenames = parseFilenames(html);
			await writeFile(join(ctx.tempDir, 'filenames.json'), JSON.stringify(filenames));
			console.log(`  Found ${filenames.length} tiles`);
		}),

		step('download-tiles', async (ctx) => {
			const tilesDir = join(ctx.dataDir, 'tiles');
			mkdirSync(tilesDir, { recursive: true });

			const filenames: string[] = JSON.parse(await readFile(join(ctx.tempDir, 'filenames.json'), 'utf-8'));

			await concurrent(
				shuffle(filenames),
				CONCURRENCY,
				async (filename) => {
					const dest = join(tilesDir, filename);
					if (existsSync(dest)) return 'skipped';

					const tmpPath = join(ctx.tempDir, `${filename}.tmp`);
					try {
						// -k for insecure SSL
						await withRetry(() => runCommand('curl', ['-sko', tmpPath, `${INDEX_URL}${filename}`]), { maxAttempts: 3 });
						renameSync(tmpPath, dest);
						return 'downloaded';
					} finally {
						try {
							rmSync(tmpPath, { force: true });
						} catch {}
					}
				},
				{ labels: ['downloaded', 'skipped'] },
			);

			await expectMinFiles(tilesDir, '*.jp2', 50);
		}),
	],
);
