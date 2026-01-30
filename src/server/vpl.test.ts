import { assertStringIncludes } from '@std/assert';
import { generateVPL } from './vpl.ts';
import { resolve } from '@std/path';
import { ensureDirSync } from '@std/fs';

const TEST_DIR = resolve(import.meta.dirname!, '../../test-data/vpl');

Deno.test({
	name: 'generateVPL - creates valid VPL file',
	fn: () => {
		// Set up test environment
		Deno.env.set('dir_data', TEST_DIR);
		ensureDirSync(resolve(TEST_DIR, 'orthophotos'));
		ensureDirSync(resolve(TEST_DIR, 'satellite/s2gm'));
		ensureDirSync(resolve(TEST_DIR, 'satellite/bluemarble'));

		// Create test versatiles files
		Deno.writeTextFileSync(resolve(TEST_DIR, 'orthophotos/test.versatiles'), '');
		Deno.writeTextFileSync(resolve(TEST_DIR, 'satellite/s2gm/s2gm_overview.versatiles'), '');
		Deno.writeTextFileSync(resolve(TEST_DIR, 'satellite/bluemarble/bluemarble.versatiles'), '');

		// Generate VPL
		generateVPL('test.vpl');

		// Read and verify the generated file
		const vpl = Deno.readTextFileSync(resolve(TEST_DIR, 'test.vpl'));

		assertStringIncludes(vpl, 'from_stacked_raster');
		assertStringIncludes(vpl, 'test.versatiles');
		assertStringIncludes(vpl, 's2gm_overview.versatiles');
		assertStringIncludes(vpl, 'bluemarble.versatiles');
		assertStringIncludes(vpl, 'raster_overscale');
		assertStringIncludes(vpl, 'filter level_max=19');
	},
	sanitizeResources: false,
	sanitizeOps: false,
});

Deno.test({
	name: 'generateVPL - handles empty orthophotos directory',
	fn: () => {
		// Set up test environment with empty orthophotos
		const emptyTestDir = resolve(TEST_DIR, 'empty');
		Deno.env.set('dir_data', emptyTestDir);
		ensureDirSync(resolve(emptyTestDir, 'orthophotos'));
		ensureDirSync(resolve(emptyTestDir, 'satellite/s2gm'));
		ensureDirSync(resolve(emptyTestDir, 'satellite/bluemarble'));
		Deno.writeTextFileSync(
			resolve(emptyTestDir, 'satellite/s2gm/s2gm_overview.versatiles'),
			'',
		);
		Deno.writeTextFileSync(
			resolve(emptyTestDir, 'satellite/bluemarble/bluemarble.versatiles'),
			'',
		);

		// Generate VPL
		generateVPL('empty.vpl');

		// Read and verify the generated file
		const vpl = Deno.readTextFileSync(resolve(emptyTestDir, 'empty.vpl'));

		assertStringIncludes(vpl, 'from_stacked_raster');
		assertStringIncludes(vpl, 's2gm_overview.versatiles');
		assertStringIncludes(vpl, 'bluemarble.versatiles');
	},
	sanitizeResources: false,
	sanitizeOps: false,
});

Deno.test({
	name: 'generateVPL - includes from_container for each versatiles file',
	fn: () => {
		Deno.env.set('dir_data', TEST_DIR);
		ensureDirSync(resolve(TEST_DIR, 'orthophotos'));
		ensureDirSync(resolve(TEST_DIR, 'satellite/s2gm'));
		ensureDirSync(resolve(TEST_DIR, 'satellite/bluemarble'));

		Deno.writeTextFileSync(resolve(TEST_DIR, 'orthophotos/region1.versatiles'), '');
		Deno.writeTextFileSync(resolve(TEST_DIR, 'orthophotos/region2.versatiles'), '');
		Deno.writeTextFileSync(resolve(TEST_DIR, 'satellite/s2gm/s2gm_overview.versatiles'), '');
		Deno.writeTextFileSync(resolve(TEST_DIR, 'satellite/bluemarble/bluemarble.versatiles'), '');

		generateVPL('multi.vpl');
		const vpl = Deno.readTextFileSync(resolve(TEST_DIR, 'multi.vpl'));

		assertStringIncludes(vpl, 'from_container');
		assertStringIncludes(vpl, 'region1.versatiles');
		assertStringIncludes(vpl, 'region2.versatiles');
	},
	sanitizeResources: false,
	sanitizeOps: false,
});

Deno.test({
	name: 'generateVPL - applies gamma/brightness/contrast to bluemarble',
	fn: () => {
		Deno.env.set('dir_data', TEST_DIR);
		ensureDirSync(resolve(TEST_DIR, 'orthophotos'));
		ensureDirSync(resolve(TEST_DIR, 'satellite/s2gm'));
		ensureDirSync(resolve(TEST_DIR, 'satellite/bluemarble'));

		Deno.writeTextFileSync(resolve(TEST_DIR, 'satellite/s2gm/s2gm_overview.versatiles'), '');
		Deno.writeTextFileSync(resolve(TEST_DIR, 'satellite/bluemarble/bluemarble.versatiles'), '');

		generateVPL('gamma.vpl');
		const vpl = Deno.readTextFileSync(resolve(TEST_DIR, 'gamma.vpl'));

		assertStringIncludes(vpl, 'gamma=0.8');
		assertStringIncludes(vpl, 'brightness=0.2');
		assertStringIncludes(vpl, 'contrast=0.8');
		assertStringIncludes(vpl, 'raster_levels');
	},
	sanitizeResources: false,
	sanitizeOps: false,
});

Deno.test({
	name: 'generateVPL - includes meta_update with attribution',
	fn: () => {
		Deno.env.set('dir_data', TEST_DIR);
		ensureDirSync(resolve(TEST_DIR, 'orthophotos'));
		ensureDirSync(resolve(TEST_DIR, 'satellite/s2gm'));
		ensureDirSync(resolve(TEST_DIR, 'satellite/bluemarble'));

		Deno.writeTextFileSync(resolve(TEST_DIR, 'satellite/s2gm/s2gm_overview.versatiles'), '');
		Deno.writeTextFileSync(resolve(TEST_DIR, 'satellite/bluemarble/bluemarble.versatiles'), '');

		generateVPL('attribution.vpl');
		const vpl = Deno.readTextFileSync(resolve(TEST_DIR, 'attribution.vpl'));

		assertStringIncludes(vpl, 'meta_update');
		assertStringIncludes(vpl, 'attribution');
	},
	sanitizeResources: false,
	sanitizeOps: false,
});
