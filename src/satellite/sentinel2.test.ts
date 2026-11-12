import { describe, expect, test } from 'vitest';
import { getConversionArgs, parseStacPage } from './sentinel2.ts';

const PREFIX = 's3://eodata/Global-Mosaics/Sentinel-2/S2MSI_L3__MCQ/2025/07/01/Sentinel-2_mosaic_2025_Q3_33UUU_0_0';

describe('parseStacPage', () => {
	test('reads the red, green and blue band of each tile as /vsis3/ paths', () => {
		const page = {
			features: [
				{
					id: 'Sentinel-2_mosaic_2025_Q3_33UUU_0_0',
					assets: {
						B02: { href: `${PREFIX}/B02.tif` },
						B03: { href: `${PREFIX}/B03.tif` },
						B04: { href: `${PREFIX}/B04.tif` },
						B08: { href: `${PREFIX}/B08.tif` },
					},
				},
			],
			links: [{ rel: 'next', href: 'https://stac.example/search', method: 'POST', body: { token: 'next:abc' } }],
		};
		const vsi = PREFIX.replace('s3://', '/vsis3/');
		expect(parseStacPage(page)).toEqual({
			items: [{ id: '2025_Q3_33UUU_0_0', red: `${vsi}/B04.tif`, green: `${vsi}/B03.tif`, blue: `${vsi}/B02.tif` }],
			next: { href: 'https://stac.example/search', body: { token: 'next:abc' } },
		});
	});

	test('skips tiles without all three colour bands and ends without a next link', () => {
		const page = { features: [{ id: 'x', assets: { B04: { href: `${PREFIX}/B04.tif` } } }], links: [] };
		expect(parseStacPage(page)).toEqual({ items: [], next: undefined });
	});
});

describe('getConversionArgs', () => {
	test('stretches each colour band to bytes and adds the nodata mask as alpha', () => {
		const args = getConversionArgs('in.vrt', 'out.tif');
		expect(args.slice(0, 11)).toEqual(['-q', '-ot', 'Byte', '-b', '1', '-b', '2', '-b', '3', '-b', 'mask']);
		for (const band of [1, 2, 3]) {
			const i = args.indexOf(`-scale_${band}`);
			expect(args.slice(i, i + 7)).toEqual([`-scale_${band}`, '100', '3250', '0', '255', `-exponent_${band}`, '0.5']);
		}
		expect(args).toContain('red,green,blue,alpha');
		expect(args.slice(-2)).toEqual(['in.vrt', 'out.tif']);
	});
});
