import { describe, expect, test } from 'vitest';
import { flightDatePriority, type IndexEntry, parseIndexPage, parseIndexYears, selectSheets } from './pl.ts';

describe('parseIndexYears', () => {
	test('reads the years of the index layers', () => {
		const caps = `<wfs:FeatureTypeList>
			<FeatureType><Name>gugik:SkorowidzOrtofomapy2025</Name></FeatureType>
			<FeatureType><Name>gugik:SkorowidzOrtofomapy1957</Name></FeatureType>
			<FeatureType><Name>gugik:SkorowidzOrtofomapy2024</Name></FeatureType>
		</wfs:FeatureTypeList>`;
		expect(parseIndexYears(caps)).toEqual([1957, 2024, 2025]);
	});
});

describe('parseIndexPage', () => {
	test('reads sheet, date, pixel size, colour, completeness and URL', () => {
		const xml = `<wfs:FeatureCollection><wfs:member>
			<gugik:SkorowidzOrtofomapy2025 gml:id="SkorowidzOrtofomapy2025.1529267">
				<gugik:godlo>N-33-81-D-d-4-4</gugik:godlo>
				<gugik:piksel>0.25</gugik:piksel>
				<gugik:kolor>RGB</gugik:kolor>
				<gugik:akt_data gml:id="SkorowidzOrtofomapy2025.1529267.akt_data"><gml:timePosition>2025-06-14</gml:timePosition></gugik:akt_data>
				<gugik:czy_ark_wypelniony>TAK</gugik:czy_ark_wypelniony>
				<gugik:url_do_pobrania>https://opendata.geoportal.gov.pl/ortofotomapa/83839/83839_1529267_N-33-81-D-d-4-4.tif</gugik:url_do_pobrania>
			</gugik:SkorowidzOrtofomapy2025>
		</wfs:member></wfs:FeatureCollection>`;
		expect(parseIndexPage(xml)).toEqual([
			{
				sheet: 'N-33-81-D-d-4-4',
				date: '2025-06-14',
				pixelSize: 0.25,
				color: 'RGB',
				complete: true,
				url: 'https://opendata.geoportal.gov.pl/ortofotomapa/83839/83839_1529267_N-33-81-D-d-4-4.tif',
			},
		]);
	});
});

function entry(sheet: string, date: string, overrides: Partial<IndexEntry> = {}): IndexEntry {
	return {
		sheet,
		date,
		pixelSize: 0.25,
		color: 'RGB',
		complete: true,
		url: `https://example.com/1_${date.slice(0, 4)}_${sheet}.tif`,
		...overrides,
	};
}

describe('selectSheets', () => {
	test('takes the newest image per sheet', () => {
		const items = selectSheets([entry('A', '2023-05-01'), entry('A', '2025-06-14'), entry('B', '2024-07-01')]);
		expect(items.map((i) => i.id).sort()).toEqual(['20240701_1_2024_B', '20250614_1_2025_A']);
	});

	test('keeps older images under a partial one until a complete one', () => {
		const items = selectSheets([
			entry('A', '2025-06-14', { complete: false }),
			entry('A', '2024-05-01', { complete: false }),
			entry('A', '2023-05-01'),
			entry('A', '2021-05-01'),
		]);
		expect(items.map((i) => i.id)).toEqual(['20250614_1_2025_A', '20240501_1_2024_A', '20230501_1_2023_A']);
	});

	test('ignores CIR and the detailed city flights', () => {
		const items = selectSheets([
			entry('A', '2025-06-14', { color: 'CIR' }),
			entry('B', '2025-06-14', { pixelSize: 0.05 }),
			entry('C', '2025-06-14'),
		]);
		expect(items.map((i) => i.id)).toEqual(['20250614_1_2025_C']);
	});
});

describe('flightDatePriority', () => {
	test('ranks newer flights higher', () => {
		expect(flightDatePriority('20250614_83839_1529267_N-33-81-D-d-4-4')).toBeGreaterThan(
			flightDatePriority('20240501_80000_1_N-33-81-D-d-4-4'),
		);
	});

	test('rejects IDs without a date', () => {
		expect(() => flightDatePriority('N-33-81-D-d-4-4')).toThrow('Unexpected Polish tile ID');
	});
});
