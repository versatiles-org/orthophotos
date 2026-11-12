import { describe, expect, test } from 'vitest';
import { getPaths, getSettlementVPL, getSteps, MAX_DISTANCE, tmpPath } from './steps.ts';

const paths = getPaths('/in/osm.versatiles', '/tmp/qz');
const steps = getSteps(paths);

function stepWritingTo(output: string) {
	const step = steps.find((s) => s.output === output);
	if (!step) throw new Error(`no step writes ${output}`);
	return step;
}

/** The value that follows `option` in `args`. */
function valueOf(args: string[], option: string): string | undefined {
	const index = args.indexOf(option);
	return index >= 0 ? args[index + 1] : undefined;
}

describe('tmpPath', () => {
	test('prefixes the basename and keeps the extension', () => {
		expect(tmpPath('/a/b/c.png')).toBe('/a/b/.tmp.c.png');
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
	test('every step writes a PNG to the tmp path of its output', () => {
		for (const step of steps) {
			expect(step.args).toContain(tmpPath(step.output));
			expect(tmpPath(step.output)).toMatch(/\.png$/);
		}
	});

	test('measures zoom 14 tile sizes through the VPL, then turns them into the proximity PNG', () => {
		expect(steps.map((s) => s.output)).toEqual([paths.tileSizes, paths.result]);
		expect(stepWritingTo(paths.tileSizes).args).toEqual([
			'dev',
			'measure-tile-sizes',
			'--level',
			'14',
			paths.vpl,
			tmpPath(paths.tileSizes),
		]);
		expect(stepWritingTo(paths.result).args).toContain(paths.tileSizes);
	});

	test('scales the distance from 255 at a settlement to 0 at MAX_DISTANCE', () => {
		const args = stepWritingTo(paths.result).args;
		const d = String(MAX_DISTANCE);
		expect(args).toContain('0=0; [1,255]=255');
		expect(valueOf(args, '--target-values')).toBe('255');
		expect(valueOf(args, '--distance-units')).toBe('pixel');
		expect(valueOf(args, '--max-distance')).toBe(d);
		// Pixels beyond the distance get the nodata value, which then has to scale to 0, not stay nodata.
		expect(valueOf(args, '--nodata')).toBe(d);
		expect(args.slice(args.indexOf('edit'), args.indexOf('edit') + 3)).toEqual(['edit', '--nodata', 'none']);
		expect(valueOf(args, '--input-min')).toBe('0');
		expect(valueOf(args, '--input-max')).toBe(d);
		expect(valueOf(args, '--output-min')).toBe('255');
		expect(valueOf(args, '--output-max')).toBe('0');
		expect(valueOf(args, '--ot')).toBe('UInt8');
		expect(valueOf(args, '--of')).toBe('PNG');
	});
});
