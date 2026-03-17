import { existsSync, mkdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { defineRegion, step } from '../framework.ts';
import { expectMinFiles } from '../validators.ts';
import { downloadFile } from '../../lib/command.ts';
import { concurrent } from '../../lib/concurrent.ts';
import { withRetry } from '../../lib/retry.ts';

const ATOM_URL = 'https://gdi.berlin.de/data/oi_dop2025_sommer/atom/';
const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });

export function parseTileUrls(xml: string): string[] {
	const parsed = xmlParser.parse(xml);

	// Top-level feed may point to a dataset feed via entry > link[rel=alternate]
	// The dataset feed (0.atom) contains entries with direct .jp2 links
	const entries: unknown[] = [parsed.feed?.entry ?? []].flat();
	const urls: string[] = [];
	for (const entry of entries) {
		const links: unknown[] = [(entry as Record<string, unknown>).link ?? []].flat();
		for (const link of links) {
			const attrs = link as Record<string, string>;
			if (attrs['@_rel'] !== 'alternate') continue;
			const href = attrs['@_href'] ?? '';
			if (href.endsWith('.jp2')) {
				urls.push(href);
			}
		}
	}
	return urls;
}

export default defineRegion('de/berlin', {
	status: 'success',
	notes: [
		'Atom feed with direct .jp2 download links.',
		'It is not possible to overlay images because a mask or alpha channel is missing.',
	],
	entries: ['tiles'],
	license: {
		name: 'DL-DE/ZERO-2.0',
		url: 'https://www.govdata.de/dl-de/zero-2-0',
		requiresAttribution: false,
	},
	creator: {
		name: 'Geoportal Berlin',
		url: 'https://gdi.berlin.de/geonetwork/srv/api/records/01e2749e-7dca-3492-8f95-29d360c3f1aa',
	},
	date: '2025',
}, [
	step('fetch-feed', async (ctx) => {
		const feedPath = join(ctx.tempDir, 'feed.xml');
		if (!existsSync(feedPath)) {
			console.log('  Fetching atom feed...');
			await withRetry(() => downloadFile(ATOM_URL, join(ctx.tempDir, 'index.xml')), { maxAttempts: 3 });

			// Parse index to find the dataset feed URL
			const indexXml = await readFile(join(ctx.tempDir, 'index.xml'), 'utf-8');
			const parsed = xmlParser.parse(indexXml);
			const entries: unknown[] = [parsed.feed?.entry ?? []].flat();
			let datasetFeedUrl: string | undefined;
			for (const entry of entries) {
				const links: unknown[] = [(entry as Record<string, unknown>).link ?? []].flat();
				for (const link of links) {
					const attrs = link as Record<string, string>;
					if (attrs['@_rel'] === 'alternate' && attrs['@_type'] === 'application/atom+xml') {
						datasetFeedUrl = attrs['@_href'];
					}
				}
			}
			if (!datasetFeedUrl) throw new Error('No dataset feed URL found in atom index');

			console.log(`  Fetching dataset feed: ${datasetFeedUrl}`);
			await withRetry(() => downloadFile(datasetFeedUrl!, feedPath), { maxAttempts: 3 });
		}
	}),

	step('download-tiles', async (ctx) => {
		const tilesDir = join(ctx.dataDir, 'tiles');
		mkdirSync(tilesDir, { recursive: true });

		const feedXml = await readFile(join(ctx.tempDir, 'feed.xml'), 'utf-8');
		const urls = parseTileUrls(feedXml);
		console.log(`  Found ${urls.length} tiles`);

		await concurrent(
			urls,
			8,
			async (url) => {
				const filename = basename(url);
				const dest = join(tilesDir, filename);
				if (existsSync(dest)) return 'skipped';
				await withRetry(() => downloadFile(url, dest), { maxAttempts: 3 });
				return 'downloaded';
			},
			{ labels: ['downloaded', 'skipped'] },
		);

		await expectMinFiles(tilesDir, '*.jp2', 50);
	}),
]);
