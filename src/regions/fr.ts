import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { downloadFile, runCommand } from '../lib/command.ts';
import { safeRm } from '../lib/fs.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { pipeline } from '../lib/pipeline.ts';
import { withRetry } from '../lib/retry.ts';
import { runMosaicAssemble, runMosaicTile } from '../run/commands.ts';

const INDEX_URL = 'https://geoservices.ign.fr/bdortho';

interface DepartmentItem {
	id: string;
	urls: string[];
	[key: string]: unknown;
}

/**
 * Parse the download page HTML and extract département groups with their 7z file URLs.
 */
export function parseDepartments(html: string): DepartmentItem[] {
	const start = html.indexOf('id="bd-ortho-derni\u00e8re-\u00e9dition"');
	const end = html.indexOf('id="bd-ortho-anciennes-\u00e9ditions"');
	if (start === -1 || end === -1) throw new Error('Could not find download section in index.html');
	const section = html.slice(start, end);

	const groups = new Map<string, string[]>();
	const pattern = /href="(https:\/\/[^"]+BDORTHO\/([^/]+)\/[^"]+)"/g;
	let match;
	while ((match = pattern.exec(section)) !== null) {
		const url = match[1];
		const group = match[2];
		if (!groups.has(group)) groups.set(group, []);
		groups.get(group)!.push(url);
	}

	return [...groups.entries()].map(([id, urls]) => ({ id, urls: urls.sort() }));
}

export default defineTileRegion({
	name: 'fr',
	meta: {
		status: 'scraping',
		notes: [
			'No API, such as an ATOM feed, available.',
			'Parsing HTML is required.',
			'Images are unnecessarily packed into container files, such as 7ZIP.',
			'The images have a high resolution, but they are not stored in tiled mode, which makes them extremely slow to read.',
			'National license instead of an international standard.',
		],
		entries: ['result'],
		license: {
			name: 'LO 2.0',
			url: 'https://www.data.gouv.fr/datasets/licence-ouverte-2-0',
			requiresAttribution: true,
		},
		creator: {
			name: "Institut national de l'information géographique et forestière (IGN-F)",
			url: 'https://geoservices.ign.fr/documentation/donnees/ortho/bdortho',
		},
		date: '2021-2025',
	},
	init: async (ctx) => {
		const indexPath = join(ctx.tempDir, 'index.html');
		if (!existsSync(indexPath)) {
			console.log('  Fetching index.html...');
			await withRetry(() => downloadFile(INDEX_URL, indexPath), { maxAttempts: 3 });
		}
		const html = await readFile(indexPath, 'utf-8');
		const departments = parseDepartments(html);
		console.log(`  Found ${departments.length} départements`);
		return departments;
	},
	downloadConcurrency: 1,
	download: async (item, { tempDir }) => {
		const { urls, id } = item as DepartmentItem;
		const extractDir = join(tempDir, id);

		if (existsSync(extractDir)) {
			return { extractDir };
		}

		const tmpExtractDir = `${extractDir}.tmp`;
		safeRm(tmpExtractDir);

		// Download all 7z parts
		console.log(`  Downloading ${id} (${urls.length} parts)...`);
		for (const url of urls) {
			const filename = url.split('/').pop()!;
			const filePath = join(tempDir, filename);
			if (!existsSync(filePath)) {
				await withRetry(() => downloadFile(url, filePath, { minSize: 1024, continue: true }), { maxAttempts: 3 });
			}
		}

		// Find the first .7z or .7z.001 file and extract
		const tmpFiles = await readdir(tempDir);
		const groupBase = id.split('/').pop() ?? id;
		let archiveFiles = tmpFiles
			.filter((f) => f.startsWith(groupBase) && (f.endsWith('.7z') || f.endsWith('.7z.001')))
			.sort();

		if (archiveFiles.length === 0) {
			archiveFiles = tmpFiles.filter((f) => f.endsWith('.7z') || f.endsWith('.7z.001')).sort();
		}

		if (archiveFiles.length === 0) {
			throw new Error(`No .7z archive found for ${id}`);
		}

		console.log(`  Extracting ${id}...`);
		const mainFile = join(tempDir, archiveFiles[0]);
		await runCommand('7z', ['e', `-o${tmpExtractDir}`, '-bb0', '-aoa', mainFile]);
		renameSync(tmpExtractDir, extractDir);

		// Clean up downloaded archive parts
		for (const url of urls) {
			const filename = url.split('/').pop()!;
			safeRm(join(tempDir, filename));
		}

		return { extractDir };
	},
	convertLimit: { concurrency: 1 },
	convert: async ({ extractDir }, { dest, tempDir }) => {
		const tilesDir = join(tempDir, `tiles_${Date.now()}`);

		const files = await readdir(extractDir);
		const jp2Files = files.filter((f) => f.endsWith('.jp2')).map((f) => join(extractDir, f));

		if (jp2Files.length === 0) {
			throw new Error(`No JP2 files found in ${extractDir}`);
		}

		// Convert each JP2 to a .versatiles container individually
		mkdirSync(tilesDir, { recursive: true });
		console.log(`  Converting ${jp2Files.length} JP2 files...`);
		const versatilesFiles: string[] = [];
		await pipeline(jp2Files, { progress: { labels: ['converted'] } }).forEach(4, async (jp2Path) => {
			const tileName = basename(jp2Path, '.jp2') + '.versatiles';
			const tilePath = join(tilesDir, tileName);
			await runMosaicTile(jp2Path, tilePath);
			versatilesFiles.push(tilePath);
			return 'converted';
		});

		// Assemble all per-file containers into one
		const filelistPath = join(tempDir, 'filelist.txt');
		writeFileSync(filelistPath, versatilesFiles.join('\n'));
		await runMosaicAssemble(filelistPath, dest, { lossless: true, quiet: true });
		rmSync(filelistPath, { force: true });

		safeRm(extractDir);
		safeRm(tilesDir);
	},
	minFiles: 100,
});
