import { describe, expect, test } from 'vitest';
import {
	type BdorthoDetailFeed,
	type BdorthoIndexPage,
	parseDetailFeed,
	parseIndexPage,
	pickBestPerZone,
	type IndexEntry,
} from './parsers.ts';

function indexEntry(title: string, zone: string, editionDate: string) {
	return {
		title,
		editionDate,
		zone: [{ term: zone }],
		link: [
			{
				href: `https://data.geopf.fr/telechargement/resource/BDORTHO/${title}`,
				rel: 'alternate',
				type: 'application/atom+xml',
			},
		],
	};
}

const INDEX_FIXTURE: BdorthoIndexPage = {
	pagecount: 3,
	totalentries: 6,
	entry: [
		indexEntry('BDORTHO_1-0_IRC-0M15_JP2-E080_LAMB93_D075_2021-01-01', 'D075', '2021-01-01'),
		indexEntry('BDORTHO_1-0_RVB-0M20_JP2-E080_LAMB93_D075_2021-01-01', 'D075', '2021-01-01'),
		indexEntry('BDORTHO_2-0_RVB-0M20_JP2-E080_LAMB93_D075_2024-01-01', 'D075', '2024-01-01'),
		indexEntry('BDORTHO_2-0_GRAPHE-MOSAIQUAGE_LAMB93_D075_2024-01-01', 'D075', '2024-01-01'),
		indexEntry('BDORTHO_1-0_RVB-0M20_JP2-E080_LAMB93_D02A_2021-01-01', 'D02A', '2021-01-01'),
		indexEntry('BDORTHO_2-0_RVB-0M50_JP2-E080_UTM20W84GUAD_D971_2022-01-01', 'D971', '2022-01-01'),
	],
};

const DETAIL_FIXTURE: BdorthoDetailFeed = {
	totalentries: 4,
	entry: [
		{
			link: [
				{ href: 'https://data.geopf.fr/telechargement/download/BDORTHO/x/x.md5', type: 'text/plain', length: 157 },
			],
		},
		{
			link: [
				{
					href: 'https://data.geopf.fr/telechargement/download/BDORTHO/x/x.7z',
					type: 'application/x-7z-compressed',
					length: 1000,
				},
			],
		},
		{
			link: [
				{
					href: 'https://data.geopf.fr/telechargement/download/BDORTHO/x/x.7z.001',
					type: 'application/octet-stream',
					length: 2000,
				},
			],
		},
		{
			link: [
				{
					href: 'https://data.geopf.fr/telechargement/download/BDORTHO/x/readme.pdf',
					type: 'application/pdf',
					length: 50,
				},
			],
		},
	],
};

describe('parseIndexPage', () => {
	test('keeps only RVB entries and ignores IRC / GRAPHE-MOSAIQUAGE', () => {
		const entries = parseIndexPage(INDEX_FIXTURE);
		const titles = entries.map((e) => e.title);
		expect(titles).not.toContain('BDORTHO_1-0_IRC-0M15_JP2-E080_LAMB93_D075_2021-01-01');
		expect(titles).not.toContain('BDORTHO_2-0_GRAPHE-MOSAIQUAGE_LAMB93_D075_2024-01-01');
		expect(titles).toHaveLength(4);
	});

	test('extracts zone, version, resolution, editionDate', () => {
		const entries = parseIndexPage(INDEX_FIXTURE);
		const d075v2 = entries.find((e) => e.zone === 'D075' && e.version === '2-0');
		expect(d075v2).toBeDefined();
		expect(d075v2?.resolution).toBe('0M20');
		expect(d075v2?.editionDate).toBe('2024-01-01');
		expect(d075v2?.detailUrl).toContain('/BDORTHO/BDORTHO_2-0_RVB-0M20_JP2-E080_LAMB93_D075_2024-01-01');
	});

	test('handles a single-entry page', () => {
		const page: BdorthoIndexPage = {
			entry: [indexEntry('BDORTHO_2-0_RVB-0M20_JP2-E080_LAMB93_D075_2024-01-01', 'D075', '2024-01-01')],
		};
		const entries = parseIndexPage(page);
		expect(entries).toHaveLength(1);
		expect(entries[0].zone).toBe('D075');
	});

	test('returns [] when entry is missing or empty', () => {
		expect(parseIndexPage({})).toEqual([]);
		expect(parseIndexPage({ entry: [] })).toEqual([]);
	});
});

describe('pickBestPerZone', () => {
	test('prefers version 2-0 over 1-0', () => {
		const entries = parseIndexPage(INDEX_FIXTURE);
		const best = pickBestPerZone(entries);
		expect(best.get('D075')?.version).toBe('2-0');
		expect(best.get('D075')?.editionDate).toBe('2024-01-01');
	});

	test('prefers higher resolution within the same version', () => {
		const base: IndexEntry = {
			title: 'x',
			zone: 'D001',
			version: '2-0',
			bands: 'RVB-0M20',
			resolution: '0M20',
			editionDate: '2024-01-01',
			detailUrl: 'u1',
		};
		const highRes: IndexEntry = { ...base, resolution: '0M15', detailUrl: 'u2' };
		const best = pickBestPerZone([base, highRes]);
		expect(best.get('D001')?.detailUrl).toBe('u2');
	});

	test('prefers newer editionDate when version and resolution tie', () => {
		const older: IndexEntry = {
			title: 'x',
			zone: 'D001',
			version: '2-0',
			bands: 'RVB-0M20',
			resolution: '0M20',
			editionDate: '2023-01-01',
			detailUrl: 'old',
		};
		const newer: IndexEntry = { ...older, editionDate: '2025-01-01', detailUrl: 'new' };
		const best = pickBestPerZone([older, newer]);
		expect(best.get('D001')?.detailUrl).toBe('new');
	});

	test('returns all zones present in input', () => {
		const entries = parseIndexPage(INDEX_FIXTURE);
		const best = pickBestPerZone(entries);
		expect([...best.keys()].sort()).toEqual(['D02A', 'D075', 'D971']);
	});
});

describe('parseDetailFeed', () => {
	test('extracts .7z and .7z.NNN parts (with byte lengths), skipping md5/pdf', () => {
		const parts = parseDetailFeed(DETAIL_FIXTURE);
		expect(parts).toEqual([
			{ url: 'https://data.geopf.fr/telechargement/download/BDORTHO/x/x.7z', length: 1000 },
			{ url: 'https://data.geopf.fr/telechargement/download/BDORTHO/x/x.7z.001', length: 2000 },
		]);
	});

	test('throws when the response is paginated (totalentries > entries)', () => {
		const truncated: BdorthoDetailFeed = {
			totalentries: 23,
			entry: [{ link: [{ href: 'https://x/x.7z.001', type: 'application/x-7z-compressed', length: 100 }] }],
		};
		expect(() => parseDetailFeed(truncated)).toThrow(/paginated response — got 1 of 23/);
	});

	test('defaults length to 0 when missing from the feed', () => {
		const noLength: BdorthoDetailFeed = {
			entry: [{ link: [{ href: 'https://x/x.7z', type: 'application/x-7z-compressed' }] }],
		};
		expect(parseDetailFeed(noLength)).toEqual([{ url: 'https://x/x.7z', length: 0 }]);
	});
});
