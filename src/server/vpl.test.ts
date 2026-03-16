import { expect, test } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateVPL } from './vpl.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_DIR = resolve(__dirname, '../../test-data/vpl');

test('generateVPL - creates valid VPL file', () => {
	// Set up test environment
	process.env['dir_data'] = TEST_DIR;
	mkdirSync(resolve(TEST_DIR, 'orthophotos'), { recursive: true });
	mkdirSync(resolve(TEST_DIR, 'satellite/s2gm'), { recursive: true });
	mkdirSync(resolve(TEST_DIR, 'satellite/bluemarble'), { recursive: true });

	// Create test versatiles files
	writeFileSync(resolve(TEST_DIR, 'orthophotos/test.versatiles'), '');
	writeFileSync(resolve(TEST_DIR, 'satellite/s2gm/s2gm_overview.versatiles'), '');
	writeFileSync(resolve(TEST_DIR, 'satellite/bluemarble/bluemarble.versatiles'), '');

	// Generate VPL
	generateVPL('test.vpl');

	// Read and verify the generated file
	const vpl = readFileSync(resolve(TEST_DIR, 'test.vpl'), 'utf-8');

	expect(vpl).toContain('from_stacked_raster');
	expect(vpl).toContain('test.versatiles');
	expect(vpl).toContain('s2gm_overview.versatiles');
	expect(vpl).toContain('bluemarble.versatiles');
	expect(vpl).toContain('raster_overscale');
	expect(vpl).toContain('filter level_max=19');
});

test('generateVPL - handles empty orthophotos directory', () => {
	// Set up test environment with empty orthophotos
	const emptyTestDir = resolve(TEST_DIR, 'empty');
	process.env['dir_data'] = emptyTestDir;
	mkdirSync(resolve(emptyTestDir, 'orthophotos'), { recursive: true });
	mkdirSync(resolve(emptyTestDir, 'satellite/s2gm'), { recursive: true });
	mkdirSync(resolve(emptyTestDir, 'satellite/bluemarble'), { recursive: true });
	writeFileSync(
		resolve(emptyTestDir, 'satellite/s2gm/s2gm_overview.versatiles'),
		'',
	);
	writeFileSync(
		resolve(emptyTestDir, 'satellite/bluemarble/bluemarble.versatiles'),
		'',
	);

	// Generate VPL
	generateVPL('empty.vpl');

	// Read and verify the generated file
	const vpl = readFileSync(resolve(emptyTestDir, 'empty.vpl'), 'utf-8');

	expect(vpl).toContain('from_stacked_raster');
	expect(vpl).toContain('s2gm_overview.versatiles');
	expect(vpl).toContain('bluemarble.versatiles');
});

test('generateVPL - includes from_container for each versatiles file', () => {
	process.env['dir_data'] = TEST_DIR;
	mkdirSync(resolve(TEST_DIR, 'orthophotos'), { recursive: true });
	mkdirSync(resolve(TEST_DIR, 'satellite/s2gm'), { recursive: true });
	mkdirSync(resolve(TEST_DIR, 'satellite/bluemarble'), { recursive: true });

	writeFileSync(resolve(TEST_DIR, 'orthophotos/region1.versatiles'), '');
	writeFileSync(resolve(TEST_DIR, 'orthophotos/region2.versatiles'), '');
	writeFileSync(resolve(TEST_DIR, 'satellite/s2gm/s2gm_overview.versatiles'), '');
	writeFileSync(resolve(TEST_DIR, 'satellite/bluemarble/bluemarble.versatiles'), '');

	generateVPL('multi.vpl');
	const vpl = readFileSync(resolve(TEST_DIR, 'multi.vpl'), 'utf-8');

	expect(vpl).toContain('from_container');
	expect(vpl).toContain('region1.versatiles');
	expect(vpl).toContain('region2.versatiles');
});

test('generateVPL - applies gamma/brightness/contrast to bluemarble', () => {
	process.env['dir_data'] = TEST_DIR;
	mkdirSync(resolve(TEST_DIR, 'orthophotos'), { recursive: true });
	mkdirSync(resolve(TEST_DIR, 'satellite/s2gm'), { recursive: true });
	mkdirSync(resolve(TEST_DIR, 'satellite/bluemarble'), { recursive: true });

	writeFileSync(resolve(TEST_DIR, 'satellite/s2gm/s2gm_overview.versatiles'), '');
	writeFileSync(resolve(TEST_DIR, 'satellite/bluemarble/bluemarble.versatiles'), '');

	generateVPL('gamma.vpl');
	const vpl = readFileSync(resolve(TEST_DIR, 'gamma.vpl'), 'utf-8');

	expect(vpl).toContain('gamma=0.8');
	expect(vpl).toContain('brightness=0.2');
	expect(vpl).toContain('contrast=0.8');
	expect(vpl).toContain('raster_levels');
});

test('generateVPL - includes meta_update with attribution', () => {
	process.env['dir_data'] = TEST_DIR;
	mkdirSync(resolve(TEST_DIR, 'orthophotos'), { recursive: true });
	mkdirSync(resolve(TEST_DIR, 'satellite/s2gm'), { recursive: true });
	mkdirSync(resolve(TEST_DIR, 'satellite/bluemarble'), { recursive: true });

	writeFileSync(resolve(TEST_DIR, 'satellite/s2gm/s2gm_overview.versatiles'), '');
	writeFileSync(resolve(TEST_DIR, 'satellite/bluemarble/bluemarble.versatiles'), '');

	generateVPL('attribution.vpl');
	const vpl = readFileSync(resolve(TEST_DIR, 'attribution.vpl'), 'utf-8');

	expect(vpl).toContain('meta_update');
	expect(vpl).toContain('attribution');
});
