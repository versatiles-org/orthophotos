import { describe, expect, test } from 'vitest';
import { getPaths, getSettlementVPL, getSteps, getWorldGeoJSON, MERCATOR_HALF_SIZE, tmpPath, ZONES } from './steps.ts';

const paths = getPaths('/in/osm.versatiles', '/tmp/qz');
const steps = getSteps(paths);

function stepWritingTo(output: string) {
	const step = steps.find((s) => s.output === output);
	if (!step) throw new Error(`no step writes ${output}`);
	return step;
}

describe('tmpPath', () => {
	test('prefixes the basename and keeps the extension', () => {
		expect(tmpPath('/a/b/c.gpkg')).toBe('/a/b/.tmp.c.gpkg');
	});
});

describe('getSettlementVPL', () => {
	test('keeps buildings and settlement land at zoom 14', () => {
		expect(getSettlementVPL('/data/osm.versatiles')).toBe(
			[
				'from_container filename="/data/osm.versatiles"',
				'  | filter level_min=14 level_max=14',
				'  | vector_filter_layers filter=["buildings","land"] invert=true',
				`  | vector_branch expr="$layer == 'land'" [`,
				`      vector_filter_features expr="kind in ['residential','commercial','industrial']"`,
				'    ]',
				'',
			].join('\n'),
		);
	});

	test('rejects inputs that would break the VPL string', () => {
		expect(() => getSettlementVPL('/data/"x".versatiles')).toThrow();
	});
});

describe('getSteps', () => {
	test('every step writes to the tmp path of its output', () => {
		for (const step of steps) expect(step.args).toContain(tmpPath(step.output));
	});

	test('every step reads only the input or outputs of earlier steps', () => {
		const available = new Set([paths.vpl, paths.world]);
		const produced = new Set(steps.map((s) => s.output));
		for (const step of steps) {
			for (const arg of step.args) {
				if (produced.has(arg)) expect(available, `${step.name} reads ${arg}`).toContain(arg);
			}
			available.add(step.output);
		}
	});

	test('measures zoom 14 tile sizes through the VPL', () => {
		const step = stepWritingTo(paths.tileSizes);
		expect(step.cmd).toBe('versatiles');
		expect(step.args).toEqual(['dev', 'measure-tile-sizes', '--level', '14', paths.vpl, tmpPath(paths.tileSizes)]);
		expect(tmpPath(paths.tileSizes)).toMatch(/\.png$/);
	});

	test('turns every nonzero tile into a 255 pixel on the Mercator square', () => {
		const args = stepWritingTo(paths.raster).args;
		expect(args).toContain(paths.tileSizes);
		const e = MERCATOR_HALF_SIZE;
		expect(args).toContain(`-${e},-${e},${e},${e}`);
		expect(args).toContain('EPSG:3857');
		expect(args).toContain('0=0; [1,255]=255');
		expect(args[args.indexOf('--nodata') + 1]).toBe('0');
		expect(args).toContain('COMPRESS=ZSTD');
	});

	test('buffers zone A by 1 km and zone B by 4 km around A', () => {
		const a = stepWritingTo(paths.bufferA).args;
		expect(a).toContain(paths.pixels);
		expect(a[a.indexOf('--distance') + 1]).toBe('1000');
		const b = stepWritingTo(paths.bufferB).args;
		expect(b).toContain(paths.bufferA);
		expect(b[b.indexOf('--distance') + 1]).toBe('4000');
	});

	test('zone B is buffer B minus A, zone C is the world minus buffer B', () => {
		expect(stepWritingTo(paths.zoneLayers.B).args.slice(-3)).toEqual([
			paths.bufferB,
			paths.bufferA,
			tmpPath(paths.zoneLayers.B),
		]);
		expect(stepWritingTo(paths.zoneLayers.C).args.slice(-3)).toEqual([
			paths.world,
			paths.bufferB,
			tmpPath(paths.zoneLayers.C),
		]);
	});

	test('tags each zone with its quality', () => {
		expect(ZONES).toEqual([
			{ zone: 'A', quality: '70,16:50,17:30' },
			{ zone: 'B', quality: '70,16:40,17:20' },
			{ zone: 'C', quality: '70,16:30,17:10' },
		]);
		for (const { zone, quality } of ZONES) {
			const sql = stepWritingTo(paths.zoneTagged[zone]).args.join(' ');
			expect(sql).toContain(`'${zone}' AS zone, '${quality}' AS quality`);
		}
	});

	test('ends with the GeoJSON and checks of it', () => {
		const [write, ...checks] = steps.slice(-3);
		expect(write.output).toBe(paths.result);
		expect(checks.map((c) => c.args[1])).toEqual(['check-geometry', 'check-coverage']);
		for (const check of checks) expect(check.args).toContain(paths.result);
	});
});

describe('getWorldGeoJSON', () => {
	test('covers the full Mercator square with whole-metre corners', () => {
		const world = JSON.parse(getWorldGeoJSON());
		expect(world.crs.properties.name).toBe('urn:ogc:def:crs:EPSG::3857');
		const ring: number[][] = world.features[0].geometry.coordinates[0];
		for (const [x, y] of ring) {
			expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
			expect(Math.abs(x)).toBeGreaterThanOrEqual(MERCATOR_HALF_SIZE);
			expect(Math.abs(y)).toBeGreaterThanOrEqual(MERCATOR_HALF_SIZE);
		}
	});
});
