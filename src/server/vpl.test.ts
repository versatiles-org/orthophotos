import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateVPL } from './vpl.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = resolve(__dirname, '../../test-data/vpl');
const COASTLINE = resolve(TEST_DIR, 'coastline/land-polygons.geojson');

test('generateVPL - masks the satellite layer with the coastline', () => {
	generateVPL(TEST_DIR, 'coast.vpl', { coastline: COASTLINE });
	const vpl = readFileSync(resolve(TEST_DIR, 'coast.vpl'), 'utf-8');

	const masked = vpl.split('\n').filter((line) => line.includes('s2gm_overview.versatiles'));
	expect(masked.length).toBeGreaterThan(1);
	for (const line of masked) {
		expect(line).toContain(`raster_mask geojson="${COASTLINE}"`);
	}
	expect(vpl).not.toMatch(/bluemarble\.versatiles"[^\n]*raster_mask/);
});

test('generateVPL - creates valid VPL with sftp orthophoto layers', () => {
	generateVPL(TEST_DIR, 'test.vpl', { coastline: COASTLINE });
	const vpl = readFileSync(resolve(TEST_DIR, 'test.vpl'), 'utf-8');

	expect(vpl).toContain('from_stacked_raster');
	expect(vpl).toContain('auto_overscale=true');
	expect(vpl).toContain('sftp://');
	expect(vpl).toContain('filter level_min=11');
	expect(vpl).toContain('s2gm_overview.versatiles');
	expect(vpl).toContain('bluemarble.versatiles');
});

test('generateVPL - includes satellite layers via sftp', () => {
	generateVPL(TEST_DIR, 'sat.vpl', { coastline: COASTLINE });
	const vpl = readFileSync(resolve(TEST_DIR, 'sat.vpl'), 'utf-8');

	expect(vpl).toContain('sftp://');
	expect(vpl).toContain('s2gm/s2gm_overview.versatiles');
	expect(vpl).toContain('bluemarble/bluemarble.versatiles');
});

test('generateVPL - applies gamma/brightness/contrast to bluemarble', () => {
	generateVPL(TEST_DIR, 'gamma.vpl', { coastline: COASTLINE });
	const vpl = readFileSync(resolve(TEST_DIR, 'gamma.vpl'), 'utf-8');

	expect(vpl).toContain('gamma=0.8');
	expect(vpl).toContain('brightness=0.2');
	expect(vpl).toContain('contrast=0.8');
	expect(vpl).toContain('raster_levels');
});

test('generateVPL - includes meta_update with attribution', () => {
	generateVPL(TEST_DIR, 'meta.vpl', { coastline: COASTLINE });
	const vpl = readFileSync(resolve(TEST_DIR, 'meta.vpl'), 'utf-8');

	expect(vpl).toContain('meta_update');
	expect(vpl).toContain('attribution');
	expect(vpl).toContain('VersaTiles');
});
