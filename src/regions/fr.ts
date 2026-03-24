import { existsSync, renameSync, rmSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { downloadFile, runCommand } from '../lib/command.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { runMosaicTile } from '../run/commands.ts';

const INDEX_URL = 'https://geoservices.ign.fr/bdortho';

export function parseDownloadUrls(html: string): string[] {
	// Extract the section between current and old editions
	const start = html.indexOf('id="bd-ortho-derni\u00e8re-\u00e9dition"');
	const end = html.indexOf('id="bd-ortho-anciennes-\u00e9ditions"');
	if (start === -1 || end === -1) throw new Error('Could not find download section in index.html');
	const section = html.slice(start, end);

	const pattern = /href="([^"]+)"/g;
	const urls: string[] = [];
	let match;
	while ((match = pattern.exec(section)) !== null) {
		urls.push(match[1]);
	}
	return urls;
}

export function groupUrlsByDistrict(urls: string[]): Map<string, string[]> {
	const groups = new Map<string, string[]>();
	for (const url of urls) {
		const match = url.match(/download\/BDORTHO\/([^/]+)\//);
		if (!match) continue;
		const group = match[1];
		if (!groups.has(group)) groups.set(group, []);
		groups.get(group)!.push(url);
	}
	return groups;
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
		date: '2024',
	},
	init: async (ctx) => {
		const indexPath = join(ctx.tempDir, 'index.html');
		if (!existsSync(indexPath)) {
			console.log('  Fetching index.html...');
			await withRetry(() => downloadFile(INDEX_URL, indexPath), { maxAttempts: 3 });
		}

		const html = await readFile(indexPath, 'utf-8');
		const urls = parseDownloadUrls(html);
		const groups = groupUrlsByDistrict(urls);
		console.log(`  Found ${urls.length} URLs in ${groups.size} groups`);

		const items: { id: string; jp2Path: string }[] = [];

		for (const [groupName, groupUrls] of groups) {
			const groupDir = join(ctx.tempDir, groupName);

			// Check if this group has already been extracted (look for JP2 files)
			if (!existsSync(groupDir)) {
				console.log(`  Processing group ${groupName} (${groupUrls.length} files)...`);
				const tmpGroupDir = `${groupDir}.tmp`;
				try {
					rmSync(tmpGroupDir, { recursive: true, force: true });
				} catch {}

				// Download all files for this group
				for (const url of groupUrls) {
					const filename = url.split('/').pop()!;
					const filePath = join(ctx.tempDir, filename);
					if (!existsSync(filePath)) {
						await withRetry(() => downloadFile(url, filePath), { maxAttempts: 3 });
					}
				}

				// Find the main .7z file and extract
				const tmpFiles = await readdir(ctx.tempDir);
				const archiveFiles = tmpFiles
					.filter(
						(f) =>
							f.startsWith(groupName.split('/').pop() ?? groupName) && (f.endsWith('.7z') || f.endsWith('.7z.001')),
					)
					.sort();

				if (archiveFiles.length === 0) {
					// Try broader match - find any .7z file related to this group
					const allArchives = tmpFiles.filter((f) => f.endsWith('.7z') || f.endsWith('.7z.001'));
					if (allArchives.length > 0) {
						const mainFile = join(ctx.tempDir, allArchives[0]);
						await runCommand('7z', ['e', `-o${tmpGroupDir}`, '-bb0', '-aoa', mainFile]);
					} else {
						console.warn(`  No .7z archive found for group ${groupName}`);
						continue;
					}
				} else {
					const mainFile = join(ctx.tempDir, archiveFiles[0]);
					await runCommand('7z', ['e', `-o${tmpGroupDir}`, '-bb0', '-aoa', mainFile]);
				}

				renameSync(tmpGroupDir, groupDir);

				// Clean up downloaded archive files
				for (const url of groupUrls) {
					const filename = url.split('/').pop()!;
					try {
						rmSync(join(ctx.tempDir, filename), { force: true });
					} catch {}
				}
			}

			// Collect JP2 files from extracted group
			if (existsSync(groupDir)) {
				const files = await readdir(groupDir);
				for (const file of files) {
					if (!file.endsWith('.jp2')) continue;
					items.push({ id: basename(file, '.jp2'), jp2Path: join(groupDir, file) });
				}
			}
		}

		console.log(`  Total: ${items.length} JP2 tiles`);
		return items;
	},
	download: async ({ jp2Path }) => {
		return { src: jp2Path as string };
	},
	convert: async ({ src }, { dest }) => {
		await runMosaicTile(src, dest);
	},
	minFiles: 123456,
});
