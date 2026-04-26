import { describe, expect, test } from 'vitest';
import { parseDetailFeed, parseIndexPage, pickBestPerZone, type IndexEntry } from './fr.ts';

const INDEX_FIXTURE = `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>
<feed xmlns:georss="http://www.georss.org/georss" xmlns:gpf_dl="https://data.geopf.fr/annexes/ressources/xsd/gpf_dl.xsd" xmlns="http://www.w3.org/2005/Atom" xml:lang="en" gpf_dl:page="1" gpf_dl:pagesize="10" gpf_dl:pagecount="3" gpf_dl:totalentries="6">
  <title>BD ORTHO®</title>
  <entry>
    <title>BDORTHO_1-0_IRC-0M15_JP2-E080_LAMB93_D075_2021-01-01</title>
    <link href="https://data.geopf.fr/telechargement/resource/BDORTHO/BDORTHO_1-0_IRC-0M15_JP2-E080_LAMB93_D075_2021-01-01" rel="alternate" type="application/atom+xml"/>
    <gpf_dl:zone term="D075" label="D075 Paris"/>
    <gpf_dl:editionDate>2021-01-01</gpf_dl:editionDate>
  </entry>
  <entry>
    <title>BDORTHO_1-0_RVB-0M20_JP2-E080_LAMB93_D075_2021-01-01</title>
    <link href="https://data.geopf.fr/telechargement/resource/BDORTHO/BDORTHO_1-0_RVB-0M20_JP2-E080_LAMB93_D075_2021-01-01" rel="alternate" type="application/atom+xml"/>
    <gpf_dl:zone term="D075" label="D075 Paris"/>
    <gpf_dl:editionDate>2021-01-01</gpf_dl:editionDate>
  </entry>
  <entry>
    <title>BDORTHO_2-0_RVB-0M20_JP2-E080_LAMB93_D075_2024-01-01</title>
    <link href="https://data.geopf.fr/telechargement/resource/BDORTHO/BDORTHO_2-0_RVB-0M20_JP2-E080_LAMB93_D075_2024-01-01" rel="alternate" type="application/atom+xml"/>
    <gpf_dl:zone term="D075" label="D075 Paris"/>
    <gpf_dl:editionDate>2024-01-01</gpf_dl:editionDate>
  </entry>
  <entry>
    <title>BDORTHO_2-0_GRAPHE-MOSAIQUAGE_LAMB93_D075_2024-01-01</title>
    <link href="https://data.geopf.fr/telechargement/resource/BDORTHO/BDORTHO_2-0_GRAPHE-MOSAIQUAGE_LAMB93_D075_2024-01-01" rel="alternate" type="application/atom+xml"/>
    <gpf_dl:zone term="D075" label="D075 Paris"/>
    <gpf_dl:editionDate>2024-01-01</gpf_dl:editionDate>
  </entry>
  <entry>
    <title>BDORTHO_1-0_RVB-0M20_JP2-E080_LAMB93_D02A_2021-01-01</title>
    <link href="https://data.geopf.fr/telechargement/resource/BDORTHO/BDORTHO_1-0_RVB-0M20_JP2-E080_LAMB93_D02A_2021-01-01" rel="alternate" type="application/atom+xml"/>
    <gpf_dl:zone term="D02A" label="D02A Corse-du-Sud"/>
    <gpf_dl:editionDate>2021-01-01</gpf_dl:editionDate>
  </entry>
  <entry>
    <title>BDORTHO_2-0_RVB-0M50_JP2-E080_UTM20W84GUAD_D971_2022-01-01</title>
    <link href="https://data.geopf.fr/telechargement/resource/BDORTHO/BDORTHO_2-0_RVB-0M50_JP2-E080_UTM20W84GUAD_D971_2022-01-01" rel="alternate" type="application/atom+xml"/>
    <gpf_dl:zone term="D971" label="D971 Guadeloupe"/>
    <gpf_dl:editionDate>2022-01-01</gpf_dl:editionDate>
  </entry>
</feed>`;

const DETAIL_FIXTURE = `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>
<feed xmlns:gpf_dl="https://data.geopf.fr/annexes/ressources/xsd/gpf_dl.xsd" xmlns="http://www.w3.org/2005/Atom">
  <title>BDORTHO_2-0_RVB-0M20_JP2-E080_LAMB93_D075_2024-01-01</title>
  <entry>
    <link href="https://data.geopf.fr/telechargement/download/BDORTHO/x/x.md5" rel="alternate" type="text/plain"/>
  </entry>
  <entry>
    <link href="https://data.geopf.fr/telechargement/download/BDORTHO/x/x.7z" rel="alternate" type="application/x-7z-compressed"/>
  </entry>
  <entry>
    <link href="https://data.geopf.fr/telechargement/download/BDORTHO/x/x.7z.001" rel="alternate" type="application/octet-stream"/>
  </entry>
  <entry>
    <link href="https://data.geopf.fr/telechargement/download/BDORTHO/x/readme.pdf" rel="alternate" type="application/pdf"/>
  </entry>
</feed>`;

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

	test('handles single entry (fast-xml-parser collapses to object)', () => {
		const xml = `<feed xmlns:gpf_dl="x">
			<entry>
				<title>BDORTHO_2-0_RVB-0M20_JP2-E080_LAMB93_D075_2024-01-01</title>
				<link href="https://example/detail" rel="alternate" type="application/atom+xml"/>
				<gpf_dl:zone term="D075"/>
				<gpf_dl:editionDate>2024-01-01</gpf_dl:editionDate>
			</entry>
		</feed>`;
		const entries = parseIndexPage(xml);
		expect(entries).toHaveLength(1);
		expect(entries[0].zone).toBe('D075');
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
	test('extracts .7z and .7z.NNN URLs, skipping md5/pdf', () => {
		const urls = parseDetailFeed(DETAIL_FIXTURE);
		expect(urls).toEqual([
			'https://data.geopf.fr/telechargement/download/BDORTHO/x/x.7z',
			'https://data.geopf.fr/telechargement/download/BDORTHO/x/x.7z.001',
		]);
	});

	test('throws when the response is paginated (totalentries > entries)', () => {
		const truncated = `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>
<feed xmlns:gpf_dl="https://data.geopf.fr/annexes/ressources/xsd/gpf_dl.xsd" xmlns="http://www.w3.org/2005/Atom" gpf_dl:page="1" gpf_dl:pagesize="10" gpf_dl:pagecount="3" gpf_dl:totalentries="23">
  <entry><link href="https://x/x.7z.001" rel="alternate" type="application/x-7z-compressed"/></entry>
</feed>`;
		expect(() => parseDetailFeed(truncated)).toThrow(/paginated response — got 1 of 23/);
	});
});
