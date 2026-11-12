import { describe, expect, test } from 'vitest';
import { createProgressParser, stripProgress, type ProgressParser } from './progress.ts';

function feed(parse: ProgressParser, stream: 'stdout' | 'stderr', chunks: string[]): (number | undefined)[] {
	return chunks.map((chunk) => parse(stream, chunk));
}

describe('gdal', () => {
	test('reads numbers and dots', () => {
		const parse = createProgressParser('gdal')!;
		// A number at the end of a chunk may continue in the next one, so it counts once the next char arrives.
		expect(feed(parse, 'stdout', ['0.', '..10', '...20.'])).toEqual([2.5, 7.5, 22.5]);
	});

	test('joins a number split across chunks', () => {
		const parse = createProgressParser('gdal')!;
		expect(feed(parse, 'stdout', ['0...90...1', '00 - done.\n'])).toEqual([97.5, 100]);
	});

	test('ignores the dot of "done." and anything after it', () => {
		const parse = createProgressParser('gdal')!;
		expect(parse('stdout', '0...10...20...30...40...50...60...70...80...90...100 - done.\n')).toBe(100);
		expect(parse('stdout', '0...10')).toBeUndefined();
	});

	test('ignores stderr', () => {
		const parse = createProgressParser('gdal')!;
		expect(parse('stderr', 'Warning 1: 50 features skipped.')).toBeUndefined();
	});
});

// Redraws as `versatiles dev measure-tile-sizes` writes them.
const bar = (label: string, done: number, total: number, percent: number): string =>
	`\r\x1b[2K${label}▕███▏${done}/${total} (${String(percent).padStart(3)}%)   0/s    0s\x1b]9;4;1;${percent}\x07`;
const index = (percent: number) => bar('reading the tile index', percent * 3, 300, percent);
const scan = (percent: number) => bar('Scanning tile sizes', percent, 100, percent);

describe('versatiles', () => {
	test('follows the tile scan, not the index read before it', () => {
		const parse = createProgressParser('versatiles')!;
		expect(feed(parse, 'stderr', [index(50), index(100), scan(0), scan(7) + scan(8)])).toEqual([
			undefined,
			undefined,
			undefined,
			8,
		]);
	});

	test('joins a redraw split across chunks', () => {
		const line = scan(45);
		const cut = line.indexOf('45%') + 1;
		const parse = createProgressParser('versatiles')!;
		expect(feed(parse, 'stderr', [line.slice(0, cut), line.slice(cut)])).toEqual([undefined, 45]);
	});

	test('never goes backwards and ignores stdout', () => {
		const parse = createProgressParser('versatiles')!;
		expect(feed(parse, 'stderr', [scan(50), scan(10)])).toEqual([50, undefined]);
		expect(parse('stdout', scan(99))).toBeUndefined();
	});
});

test('other commands have no parser', () => {
	expect(createProgressParser('curl')).toBeUndefined();
});

test('stripProgress keeps warnings and drops escapes and bar redraws', () => {
	const stderr = `${index(100)}${scan(0)}\nWARN: something\n${scan(100)}\x1b]9;4;0;\x07\n\n`;
	expect(stripProgress(stderr)).toEqual(['WARN: something']);
});
