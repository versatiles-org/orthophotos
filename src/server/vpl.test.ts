import { expect, test } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateVPL } from './vpl.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = resolve(__dirname, '../../test-data/vpl');

function setupDirs(base: string) {
	mkdirSync(resolve(base, 'orthophotos'), { recursive: true });
	mkdirSync(resolve(base, 'satellite/s2gm'), { recursive: true });
	mkdirSync(resolve(base, 'satellite/bluemarble'), { recursive: true });
	writeFileSync(resolve(base, 'satellite/s2gm/s2gm_overview.versatiles'), '');
	writeFileSync(resolve(base, 'satellite/bluemarble/bluemarble.versatiles'), '');
}

test('generateVPL - creates valid VPL with orthophoto layers', () => {
	process.env['dir_data'] = TEST_DIR;
	setupDirs(TEST_DIR);

	// Create a versatiles file matching a real region (li has status: success, entries: ['result'])
	mkdirSync(resolve(TEST_DIR, 'orthophotos/li'), { recursive: true });
	writeFileSync(resolve(TEST_DIR, 'orthophotos/li/result.versatiles'), '');

	generateVPL('test.vpl');
	const vpl = readFileSync(resolve(TEST_DIR, 'test.vpl'), 'utf-8');

	expect(vpl).toContain('from_stacked_raster');
	expect(vpl).toContain('auto_overscale=true');
	expect(vpl).toContain('li/result.versatiles');
	expect(vpl).toContain('filter level_min=11');
	expect(vpl).toContain('s2gm_overview.versatiles');
	expect(vpl).toContain('bluemarble.versatiles');
});

test('generateVPL - includes satellite layers even without orthophotos', () => {
	const emptyTestDir = resolve(TEST_DIR, 'empty');
	process.env['dir_data'] = emptyTestDir;
	setupDirs(emptyTestDir);

	generateVPL('empty.vpl');
	const vpl = readFileSync(resolve(emptyTestDir, 'empty.vpl'), 'utf-8');

	expect(vpl).toContain('from_stacked_raster');
	expect(vpl).toContain('s2gm_overview.versatiles');
	expect(vpl).toContain('bluemarble.versatiles');
});

test('generateVPL - applies gamma/brightness/contrast to bluemarble', () => {
	process.env['dir_data'] = TEST_DIR;
	setupDirs(TEST_DIR);

	generateVPL('gamma.vpl');
	const vpl = readFileSync(resolve(TEST_DIR, 'gamma.vpl'), 'utf-8');

	expect(vpl).toContain('gamma=0.8');
	expect(vpl).toContain('brightness=0.2');
	expect(vpl).toContain('contrast=0.8');
	expect(vpl).toContain('raster_levels');
});

test('generateVPL - includes meta_update with attribution', () => {
	process.env['dir_data'] = TEST_DIR;
	setupDirs(TEST_DIR);

	generateVPL('meta.vpl');
	const vpl = readFileSync(resolve(TEST_DIR, 'meta.vpl'), 'utf-8');

	expect(vpl).toContain('meta_update');
	expect(vpl).toContain('attribution');
	expect(vpl).toContain('VersaTiles');
});

test('generateVPL - skips regions with missing files', () => {
	const testDir = resolve(TEST_DIR, 'missing');
	process.env['dir_data'] = testDir;
	setupDirs(testDir);

	// Don't create any orthophoto files — all regions should be skipped
	generateVPL('missing.vpl');
	const vpl = readFileSync(resolve(testDir, 'missing.vpl'), 'utf-8');

	// Should still have satellite layers but no level_min=11 filters (no ortho layers)
	expect(vpl).not.toContain('level_min=11');
	expect(vpl).toContain('s2gm_overview.versatiles');
});
