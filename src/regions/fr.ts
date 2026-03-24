import { existsSync, renameSync, rmSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { downloadFile, runCommand } from '../lib/command.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { runMosaicTile } from '../run/commands.ts';

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
		status: 'released',
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
		try {
			rmSync(tmpExtractDir, { recursive: true, force: true });
		} catch {}

		try {
			// Download all 7z parts
			console.log(`  Downloading ${id} (${urls.length} parts)...`);
			for (const url of urls) {
				const filename = url.split('/').pop()!;
				const filePath = join(tempDir, filename);
				if (!existsSync(filePath)) {
					await withRetry(() => downloadFile(url, filePath), { maxAttempts: 3 });
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
				try {
					rmSync(join(tempDir, filename), { force: true });
				} catch {}
			}

			return { extractDir };
		} catch (err) {
			try {
				rmSync(tmpExtractDir, { recursive: true, force: true });
			} catch {}
			for (const url of urls) {
				const filename = url.split('/').pop()!;
				try {
					rmSync(join(tempDir, filename), { force: true });
				} catch {}
			}
			throw err;
		}
	},
	convert: async ({ extractDir }, { dest }) => {
		const vrtPath = `${dest}.vrt`;
		try {
			const files = await readdir(extractDir as string);
			const jp2Files = files.filter((f) => f.endsWith('.jp2')).map((f) => join(extractDir as string, f));

			if (jp2Files.length === 0) {
				throw new Error(`No JP2 files found in ${extractDir}`);
			}

			await runCommand('gdalbuildvrt', [vrtPath, ...jp2Files]);
			await runMosaicTile(vrtPath, dest);
		} finally {
			try {
				rmSync(vrtPath, { force: true });
			} catch {}
			try {
				rmSync(extractDir as string, { recursive: true, force: true });
			} catch {}
		}
	},
	minFiles: 100,
});
