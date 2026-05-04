import { describe, expect, test } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bboxesOverlap, computeWmsBlocks, parseWmsCapabilities } from './wms.ts';
import type { WmsBbox } from './wms.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = resolve(__dirname, '../../test-data/wms-temp');

describe('computeWmsBlocks', () => {
	test('returns items covering the bbox', () => {
		const bbox: WmsBbox = {
			xmin: 600000,
			ymin: 5900000,
			xmax: 800000,
			ymax: 6100000,
		};

		const result = computeWmsBlocks(bbox, 14, 4096, 4096);

		expect(result.items.length).toBeGreaterThan(0);
		expect(result.blockPx).toBe(4096);

		// Every item should have an id and valid coordinates
		for (const item of result.items) {
			expect(item.id).toMatch(/^\d+_\d+$/);
			expect(item.x0).toBeLessThan(item.x1);
			expect(item.y0).toBeLessThan(item.y1);
		}
	});

	test('blockPx is largest power of 2 <= min(maxWidth, maxHeight)', () => {
		const bbox: WmsBbox = { xmin: 0, ymin: 0, xmax: 1000000, ymax: 1000000 };

		const result1 = computeWmsBlocks(bbox, 10, 8192, 8192);
		expect(result1.blockPx).toBe(8192);

		const result2 = computeWmsBlocks(bbox, 10, 4096, 8192);
		expect(result2.blockPx).toBe(4096);

		const result3 = computeWmsBlocks(bbox, 10, 5000, 5000);
		expect(result3.blockPx).toBe(4096);

		const result4 = computeWmsBlocks(bbox, 10, 512, 512);
		expect(result4.blockPx).toBe(512);
	});

	test('throws if maxWidth/maxHeight too small', () => {
		const bbox: WmsBbox = { xmin: 0, ymin: 0, xmax: 1000000, ymax: 1000000 };

		expect(() => computeWmsBlocks(bbox, 10, 256, 256)).toThrow('too small');
	});

	test('higher zoom produces more items', () => {
		const bbox: WmsBbox = {
			xmin: 1000000,
			ymin: 6000000,
			xmax: 1500000,
			ymax: 6500000,
		};

		const lowZoom = computeWmsBlocks(bbox, 10, 4096, 4096);
		const highZoom = computeWmsBlocks(bbox, 14, 4096, 4096);

		expect(highZoom.items.length).toBeGreaterThan(lowZoom.items.length);
	});

	test('blocks cover the entire bbox', () => {
		const bbox: WmsBbox = {
			xmin: 500000,
			ymin: 5500000,
			xmax: 700000,
			ymax: 5700000,
		};

		const result = computeWmsBlocks(bbox, 12, 4096, 4096);

		const minX = Math.min(...result.items.map((i) => i.x0));
		const maxX = Math.max(...result.items.map((i) => i.x1));
		const minY = Math.min(...result.items.map((i) => i.y0));
		const maxY = Math.max(...result.items.map((i) => i.y1));

		expect(minX).toBeLessThanOrEqual(bbox.xmin);
		expect(maxX).toBeGreaterThanOrEqual(bbox.xmax);
		expect(minY).toBeLessThanOrEqual(bbox.ymin);
		expect(maxY).toBeGreaterThanOrEqual(bbox.ymax);
	});

	test('single-tile bbox returns at least one item', () => {
		const bbox: WmsBbox = {
			xmin: 1000000,
			ymin: 6000000,
			xmax: 1000001,
			ymax: 6000001,
		};

		const result = computeWmsBlocks(bbox, 10, 4096, 4096);
		expect(result.items.length).toBeGreaterThanOrEqual(1);
	});
});

describe('bboxesOverlap', () => {
	test('returns true when bboxes overlap', () => {
		const a: WmsBbox = { xmin: 0, ymin: 0, xmax: 100, ymax: 100 };
		const b: WmsBbox = { xmin: 50, ymin: 50, xmax: 150, ymax: 150 };
		expect(bboxesOverlap(a, b)).toBe(true);
	});

	test('returns false when one bbox is fully outside the other', () => {
		const a: WmsBbox = { xmin: 0, ymin: 0, xmax: 100, ymax: 100 };
		const b: WmsBbox = { xmin: 200, ymin: 0, xmax: 300, ymax: 100 };
		expect(bboxesOverlap(a, b)).toBe(false);
	});

	test('returns false when bboxes only touch at an edge', () => {
		const a: WmsBbox = { xmin: 0, ymin: 0, xmax: 100, ymax: 100 };
		const b: WmsBbox = { xmin: 100, ymin: 0, xmax: 200, ymax: 100 };
		expect(bboxesOverlap(a, b)).toBe(false);
	});

	test('returns true when one bbox is fully inside the other', () => {
		const outer: WmsBbox = { xmin: 0, ymin: 0, xmax: 100, ymax: 100 };
		const inner: WmsBbox = { xmin: 25, ymin: 25, xmax: 75, ymax: 75 };
		expect(bboxesOverlap(outer, inner)).toBe(true);
		expect(bboxesOverlap(inner, outer)).toBe(true);
	});
});

describe('parseWmsCapabilities', () => {
	test('parses EPSG:3857 bounding box from capabilities XML', async () => {
		mkdirSync(TEST_DIR, { recursive: true });
		const capsPath = resolve(TEST_DIR, 'caps_3857.xml');
		writeFileSync(
			capsPath,
			`<?xml version="1.0" encoding="UTF-8"?>
<WMS_Capabilities version="1.3.0">
  <Capability>
    <Request>
      <GetMap>
        <MaxWidth>4096</MaxWidth>
        <MaxHeight>4096</MaxHeight>
      </GetMap>
    </Request>
    <Layer>
      <Layer>
        <Name>orthophoto</Name>
        <BoundingBox CRS="EPSG:3857" minx="600000" miny="5900000" maxx="1900000" maxy="6300000"/>
      </Layer>
    </Layer>
  </Capability>
</WMS_Capabilities>`,
		);

		try {
			const result = await parseWmsCapabilities(capsPath, 'orthophoto');
			expect(result.bbox.xmin).toBe(600000);
			expect(result.bbox.ymin).toBe(5900000);
			expect(result.bbox.xmax).toBe(1900000);
			expect(result.bbox.ymax).toBe(6300000);
			expect(result.maxWidth).toBe(4096);
			expect(result.maxHeight).toBe(4096);
		} finally {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	test('falls back to LatLonBoundingBox when no EPSG:3857', async () => {
		mkdirSync(TEST_DIR, { recursive: true });
		const capsPath = resolve(TEST_DIR, 'caps_latlon.xml');
		writeFileSync(
			capsPath,
			`<?xml version="1.0" encoding="UTF-8"?>
<WMT_MS_Capabilities version="1.1.1">
  <Capability>
    <Request>
      <GetMap/>
    </Request>
    <Layer>
      <Name>myphoto</Name>
      <LatLonBoundingBox minx="5" miny="45" maxx="15" maxy="55"/>
    </Layer>
  </Capability>
</WMT_MS_Capabilities>`,
		);

		try {
			const result = await parseWmsCapabilities(capsPath, 'myphoto');
			// Should have converted lat/lon to EPSG:3857
			expect(result.bbox.xmin).toBeCloseTo(556597.45, 0);
			expect(result.bbox.xmax).toBeCloseTo(1669792.36, 0);
			expect(result.bbox.ymin).toBeCloseTo(5621521.49, 0);
			expect(result.bbox.ymax).toBeCloseTo(7361866.11, 0);
			// Default max dimensions when not specified
			expect(result.maxWidth).toBe(8192);
			expect(result.maxHeight).toBe(8192);
		} finally {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	test('throws on invalid XML without capabilities root', async () => {
		mkdirSync(TEST_DIR, { recursive: true });
		const capsPath = resolve(TEST_DIR, 'caps_invalid.xml');
		writeFileSync(capsPath, `<?xml version="1.0"?><Root><Something/></Root>`);

		try {
			await expect(parseWmsCapabilities(capsPath, 'layer')).rejects.toThrow('Invalid WMS capabilities XML');
		} finally {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	test('throws when layer not found', async () => {
		mkdirSync(TEST_DIR, { recursive: true });
		const capsPath = resolve(TEST_DIR, 'caps_nolayer.xml');
		writeFileSync(
			capsPath,
			`<?xml version="1.0"?>
<WMS_Capabilities>
  <Capability>
    <Request><GetMap/></Request>
    <Layer><Name>other</Name></Layer>
  </Capability>
</WMS_Capabilities>`,
		);

		try {
			await expect(parseWmsCapabilities(capsPath, 'missing_layer')).rejects.toThrow("Layer 'missing_layer' not found");
		} finally {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	test('parses CRS:84 BoundingBox (lon,lat) from WMS 1.3.0 capabilities', async () => {
		mkdirSync(TEST_DIR, { recursive: true });
		const capsPath = resolve(TEST_DIR, 'caps_crs84.xml');
		writeFileSync(
			capsPath,
			`<?xml version="1.0"?>
<WMS_Capabilities version="1.3.0">
  <Capability>
    <Request><GetMap/></Request>
    <Layer>
      <Name>geo</Name>
      <BoundingBox CRS="CRS:84" minx="5" miny="45" maxx="15" maxy="55"/>
    </Layer>
  </Capability>
</WMS_Capabilities>`,
		);

		try {
			const result = await parseWmsCapabilities(capsPath, 'geo');
			expect(result.bbox.xmin).toBeCloseTo(556597.45, 0);
			expect(result.bbox.xmax).toBeCloseTo(1669792.36, 0);
			expect(result.bbox.ymin).toBeCloseTo(5621521.49, 0);
			expect(result.bbox.ymax).toBeCloseTo(7361866.11, 0);
		} finally {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	test('falls back to EX_GeographicBoundingBox in WMS 1.3.0 capabilities', async () => {
		mkdirSync(TEST_DIR, { recursive: true });
		const capsPath = resolve(TEST_DIR, 'caps_ex.xml');
		writeFileSync(
			capsPath,
			`<?xml version="1.0"?>
<WMS_Capabilities version="1.3.0">
  <Capability>
    <Request><GetMap/></Request>
    <Layer>
      <Name>exgeo</Name>
      <EX_GeographicBoundingBox>
        <westBoundLongitude>5</westBoundLongitude>
        <eastBoundLongitude>15</eastBoundLongitude>
        <southBoundLatitude>45</southBoundLatitude>
        <northBoundLatitude>55</northBoundLatitude>
      </EX_GeographicBoundingBox>
    </Layer>
  </Capability>
</WMS_Capabilities>`,
		);

		try {
			const result = await parseWmsCapabilities(capsPath, 'exgeo');
			expect(result.bbox.xmin).toBeCloseTo(556597.45, 0);
			expect(result.bbox.xmax).toBeCloseTo(1669792.36, 0);
			expect(result.bbox.ymin).toBeCloseTo(5621521.49, 0);
			expect(result.bbox.ymax).toBeCloseTo(7361866.11, 0);
		} finally {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});

	test('clamps bbox to world extent', async () => {
		mkdirSync(TEST_DIR, { recursive: true });
		const capsPath = resolve(TEST_DIR, 'caps_clamp.xml');
		writeFileSync(
			capsPath,
			`<?xml version="1.0"?>
<WMS_Capabilities>
  <Capability>
    <Request><GetMap/></Request>
    <Layer>
      <Name>world</Name>
      <BoundingBox SRS="EPSG:3857" minx="-99999999" miny="-99999999" maxx="99999999" maxy="99999999"/>
    </Layer>
  </Capability>
</WMS_Capabilities>`,
		);

		try {
			const WORLD_EXTENT = 20037508.342789244;
			const result = await parseWmsCapabilities(capsPath, 'world');
			expect(result.bbox.xmin).toBe(-WORLD_EXTENT);
			expect(result.bbox.ymin).toBe(-WORLD_EXTENT);
			expect(result.bbox.xmax).toBe(WORLD_EXTENT);
			expect(result.bbox.ymax).toBe(WORLD_EXTENT);
		} finally {
			rmSync(TEST_DIR, { recursive: true, force: true });
		}
	});
});
