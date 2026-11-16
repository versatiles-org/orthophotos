import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { flightMonthPriority, parseListingPage } from './es.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** One row of the CNIG `archivosSerie` listing of series 02211, as served in November 2026. */
const ROW = readFileSync(resolve(__dirname, '../../test-data/es/listing-row.html'), 'utf-8');

describe('parseListingPage', () => {
	test('reads name, flight month, number and size of each row', () => {
		const page = `<table><tbody>${ROW}${ROW.replaceAll('11547121', '11547122')}</tbody></table>`;
		const files = parseListingPage(page);
		expect(files).toHaveLength(2);
		expect(files[0]).toEqual({
			id: '202309_PNOA-MA-OF-ETRS89-HU29-H25-0001-2',
			name: 'PNOA-MA-OF-ETRS89-HU29-H25-0001-2.TIF',
			sec: '11547121',
			sizeMb: 351.89,
		});
		expect(files[1].sec).toBe('11547122');
	});

	test('returns no files past the last page', () => {
		expect(parseListingPage('<table><tbody></tbody></table>')).toEqual([]);
	});

	test('throws on a row it cannot read, rather than skipping a file', () => {
		expect(() => parseListingPage(ROW.replace('09/2023', 'sept. 2023'))).toThrow('Unexpected row');
	});
});

test('flightMonthPriority draws newer flights on top', () => {
	expect(flightMonthPriority('202409_PNOA-MA-OF-ETRS89-HU30-H25-0559-1')).toBeGreaterThan(
		flightMonthPriority('202309_PNOA-MA-OF-ETRS89-HU30-H25-0559-1'),
	);
});
