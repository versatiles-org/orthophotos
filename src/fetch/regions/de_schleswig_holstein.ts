import { mkdirSync, existsSync, statSync, renameSync, rmSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { defineRegion, step } from '../framework.ts';
import { expectMinFiles } from '../validators.ts';
import { createProgress } from '../progress.ts';
import { runCommand } from '../../lib/command.ts';
import { withRetry } from '../../lib/retry.ts';

const ATOM_URL = 'https://service.gdi-sh.de/SH_OpenGBD/feeds/DOP20/DOP20.xml';
const TILE_XML_BASE = 'https://service.gdi-sh.de/SH_OpenGBD/feeds/DOP20/DOP20_';
const CONCURRENCY = 16;

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

async function downloadFile(url: string, dest: string): Promise<void> {
	await runCommand('curl', ['-so', dest, url]);
}

export function parseTileIds(xml: string): string[] {
	const parsed = xmlParser.parse(xml);
	const entries: unknown[] = [parsed.feed?.entry ?? []].flat();
	const ids: string[] = [];
	for (const entry of entries) {
		const links: unknown[] = [(entry as Record<string, unknown>).link ?? []].flat();
		for (const link of links) {
			const attrs = link as Record<string, string>;
			if (attrs['@_rel'] !== 'alternate') continue;
			const href = attrs['@_href'] ?? '';
			const match = href.match(/DOP20_(dop20rgbi[^.]+)\.xml$/);
			if (match) ids.push(match[1]);
		}
	}
	return ids;
}

export function parseTileUrl(xml: string): string | undefined {
	const parsed = xmlParser.parse(xml);
	const entries: unknown[] = [parsed.feed?.entry ?? []].flat();
	for (const entry of entries) {
		const links: unknown[] = [(entry as Record<string, unknown>).link ?? []].flat();
		for (const link of links) {
			const attrs = link as Record<string, string>;
			if (attrs['@_rel'] !== 'alternate') continue;
			const href = attrs['@_href'] ?? '';
			if (href.includes('INTERPOLATION=cubic')) {
				return href.replace(/amp;/g, '');
			}
		}
	}
	return undefined;
}

function shuffle<T>(array: T[]): T[] {
	const result = [...array];
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[result[i], result[j]] = [result[j], result[i]];
	}
	return result;
}

async function processTile(id: string, tilesDir: string, tempDir: string): Promise<'skipped' | 'converted' | 'empty'> {
	const destJp2 = join(tilesDir, `${id}.jp2`);
	if (existsSync(destJp2)) return 'skipped';

	const tileXmlPath = join(tempDir, `${id}.xml`);
	const tifPath = join(tempDir, `${id}.tif`);
	const jp2Path = join(tempDir, `${id}.jp2`);

	try {
		await withRetry(() => downloadFile(`${TILE_XML_BASE}${id}.xml`, tileXmlPath), { maxAttempts: 3 });

		const tileXml = await readFile(tileXmlPath, 'utf-8');
		const url = parseTileUrl(tileXml);
		if (!url) {
			console.warn(`  No image URL found for ${id}, skipping`);
			return 'empty';
		}

		await withRetry(() => downloadFile(url, tifPath), { maxAttempts: 3 });

		const size = statSync(tifPath).size;
		if (size === 46) {
			return 'empty';
		}

		await runCommand('gdal_translate', ['-q', tifPath, jp2Path, '-co', 'QUALITY=100']);
		renameSync(jp2Path, destJp2);
		return 'converted';
	} finally {
		for (const ext of ['.xml', '.tif', '.jp2']) {
			const p = join(tempDir, `${id}${ext}`);
			try {
				rmSync(p, { force: true });
			} catch {}
		}
	}
}

export default defineRegion('de/schleswig_holstein', [
	step('fetch-index', async (ctx) => {
		const atomPath = join(ctx.tempDir, 'atom.xml');
		if (!existsSync(atomPath)) {
			console.log('  Fetching atom.xml...');
			await withRetry(() => downloadFile(ATOM_URL, atomPath), { maxAttempts: 3 });
		}
	}),

	step('parse-ids', async (ctx) => {
		const atomPath = join(ctx.tempDir, 'atom.xml');
		const xml = await readFile(atomPath, 'utf-8');
		const ids = parseTileIds(xml);
		await writeFile(join(ctx.tempDir, 'ids.json'), JSON.stringify(ids));
		console.log(`  Found ${ids.length} tile IDs`);
	}),

	step('download-tiles', async (ctx) => {
		const tilesDir = join(ctx.dataDir, 'tiles');
		mkdirSync(tilesDir, { recursive: true });

		const ids: string[] = JSON.parse(await readFile(join(ctx.tempDir, 'ids.json'), 'utf-8'));
		const shuffled = shuffle(ids);

		const progress = createProgress(shuffled.length, {
			etaLabel: 'converted',
			labels: ['converted', 'skipped', 'empty'],
		});

		const queue = [...shuffled];
		const workers = Array.from({ length: CONCURRENCY }, async () => {
			while (queue.length > 0) {
				const id = queue.shift()!;
				const result = await processTile(id, tilesDir, ctx.tempDir);
				progress.tick(result);
			}
		});

		await Promise.all(workers);
		progress.done();

		await expectMinFiles(tilesDir, '*.jp2', 50);
	}),
]);
