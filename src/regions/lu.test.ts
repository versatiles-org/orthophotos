import { describe, expect, test } from 'vitest';
import { parseMunicipalityFiles } from './lu.ts';

const BASE =
	'https://download.data.public.lu/resources/orthophoto-officielle-du-grand-duche-de-luxembourg-edition-ete-2025';

describe('parseMunicipalityFiles', () => {
	test('keeps the per-municipality RGB files and names them after the municipality', () => {
		const dataset = {
			resources: [
				{ url: `${BASE}/20251201-204218/orthophoto-2025-ete-10cm-rgb-remich.jp2` },
				{ url: `${BASE}/20251201-204218/orthophoto-2025-ete-10cm-cir-remich.jp2` },
				{ url: `${BASE}/20251114-065722/orthophoto_2025_ete_10cm_rgb.jp2` },
				{ url: `${BASE}/20260507-121045/orthophoto-2025-ete-10cm-rgb-bech.jp2` },
				{ url: `${BASE}/20251201-000000/plan-de-vol.gpkg` },
			],
		};
		expect(parseMunicipalityFiles(dataset)).toEqual([
			{ id: 'bech', url: `${BASE}/20260507-121045/orthophoto-2025-ete-10cm-rgb-bech.jp2` },
			{ id: 'remich', url: `${BASE}/20251201-204218/orthophoto-2025-ete-10cm-rgb-remich.jp2` },
		]);
	});
});
