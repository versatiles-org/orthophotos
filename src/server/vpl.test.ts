import { expect, test } from 'vitest';
import { mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.ts';
import { generateVPL } from './vpl.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = resolve(__dirname, '../../test-data/vpl');

function setup(base: string) {
	config.dirData = base;
	mkdirSync(base, { recursive: true });
}

test('generateVPL - creates valid VPL with sftp orthophoto layers', () => {
	setup(TEST_DIR);

	generateVPL('test.vpl');
	const vpl = readFileSync(resolve(TEST_DIR, 'test.vpl'), 'utf-8');

	expect(vpl).toContain('from_stacked_raster');
	expect(vpl).toContain('auto_overscale=true');
	expect(vpl).toContain('sftp://');
	expect(vpl).toContain('filter level_min=11');
	expect(vpl).toContain('s2gm_overview.versatiles');
	expect(vpl).toContain('bluemarble.versatiles');
});

test('generateVPL - includes satellite layers via sftp', () => {
	setup(TEST_DIR);

	generateVPL('sat.vpl');
	const vpl = readFileSync(resolve(TEST_DIR, 'sat.vpl'), 'utf-8');

	expect(vpl).toContain('sftp://');
	expect(vpl).toContain('s2gm/s2gm_overview.versatiles');
	expect(vpl).toContain('bluemarble/bluemarble.versatiles');
});

test('generateVPL - applies gamma/brightness/contrast to bluemarble', () => {
	setup(TEST_DIR);

	generateVPL('gamma.vpl');
	const vpl = readFileSync(resolve(TEST_DIR, 'gamma.vpl'), 'utf-8');

	expect(vpl).toContain('gamma=0.8');
	expect(vpl).toContain('brightness=0.2');
	expect(vpl).toContain('contrast=0.8');
	expect(vpl).toContain('raster_levels');
});

test('generateVPL - includes meta_update with attribution', () => {
	setup(TEST_DIR);

	generateVPL('meta.vpl');
	const vpl = readFileSync(resolve(TEST_DIR, 'meta.vpl'), 'utf-8');

	expect(vpl).toContain('meta_update');
	expect(vpl).toContain('attribution');
	expect(vpl).toContain('VersaTiles');
});
