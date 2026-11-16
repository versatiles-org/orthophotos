import { describe, expect, test } from 'vitest';
import { NAIP_CONTAINER, naipFile, parseBlobList } from './scraper.ts';
import { US_STATES } from './states.ts';

describe('parseBlobList', () => {
	test('returns the GeoTIFFs and the marker of the next page', () => {
		const xml = `<?xml version="1.0" encoding="utf-8"?><EnumerationResults><Blobs>
			<Blob><Name>v002/de/2023/de_030cm_2023/38075/m_3807535_nw_18_030_20230819_20230919.tif</Name><Properties><Content-Length>1</Content-Length></Properties></Blob>
			<Blob><Name>v002/de/2023/de_030cm_2023/38075/m_3807535_nw_18_030_20230819_20230919.200.jpg</Name></Blob>
			<Blob><Name>v002/de/2023/de_fgdc_2023/38075/m_3807535_nw_18_030_20230819_20230919.txt</Name></Blob>
		</Blobs><NextMarker>2!152!MDAwMDcy</NextMarker></EnumerationResults>`;
		expect(parseBlobList(xml)).toEqual({
			names: ['v002/de/2023/de_030cm_2023/38075/m_3807535_nw_18_030_20230819_20230919.tif'],
			nextMarker: '2!152!MDAwMDcy',
		});
	});

	test('has no marker on the last page', () => {
		expect(parseBlobList('<EnumerationResults><Blobs></Blobs><NextMarker /></EnumerationResults>')).toEqual({
			names: [],
			nextMarker: null,
		});
	});
});

test('naipFile names the item after the file', () => {
	expect(naipFile('v002/de/2023/de_030cm_2023/38075/m_3807535_nw_18_030_20230819_20230919.tif')).toEqual({
		id: 'm_3807535_nw_18_030_20230819_20230919',
		url: `${NAIP_CONTAINER}/v002/de/2023/de_030cm_2023/38075/m_3807535_nw_18_030_20230819_20230919.tif`,
	});
});

test('the state table has 48 states with valid IDs and unique codes', () => {
	expect(US_STATES).toHaveLength(48);
	for (const s of US_STATES) expect(s.name).toMatch(/^us\/[a-z_]+$/);
	expect(new Set(US_STATES.map((s) => s.code)).size).toBe(48);
});
