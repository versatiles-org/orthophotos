import { existsSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import { downloadFile } from '../lib/command.ts';
import { defineTileRegion } from '../lib/process_tiles.ts';
import { withRetry } from '../lib/retry.ts';
import { runVersatilesRasterConvert } from '../run/commands.ts';

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

export default defineTileRegion({
	name: 'de/berlin',
	meta: {
		status: 'success',
		notes: [
			'Atom feed with direct .jp2 download links.',
			'It is not possible to overlay images because a mask or alpha channel is missing.',
		],
		entries: ['result'],
		license: {
			name: 'DL-DE/ZERO-2.0',
			url: 'https://www.govdata.de/dl-de/zero-2-0',
			requiresAttribution: false,
		},
		creator: {
			name: 'Geoportal Berlin',
			url: 'https://daten.berlin.de/datensaetze/orthofotografie-im-inspire-datenmodell-truedop20rgbi-2025-sommer-f9369d23',
		},
		date: '2025',
	},
	init: async (ctx) => {
		const feedPath = join(ctx.tempDir, 'feed.xml');
		if (!existsSync(feedPath)) {
			console.log('  Fetching atom feed...');
			await withRetry(() => downloadFile(ATOM_URL, join(ctx.tempDir, 'index.xml')), { maxAttempts: 3 });

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

		const feedXml = await readFile(feedPath, 'utf-8');
		const urls = parseTileUrls(feedXml);
		return urls.map((url) => ({ id: basename(url, '.jp2'), url }));
	},
	downloadConcurrency: 8,
	download: async ({ url, id }, { dest, tempDir }) => {
		const jp2Path = join(tempDir, `${id}.jp2`);
		try {
			await withRetry(() => downloadFile(url, jp2Path), { maxAttempts: 3 });
			await runVersatilesRasterConvert(jp2Path, dest);
		} finally {
			try {
				rmSync(jp2Path, { force: true });
			} catch {}
		}
	},
	minFiles: 123456,
});
