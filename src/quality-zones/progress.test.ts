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

describe('osmium', () => {
	test('reads the last percentage of a chunk', () => {
		const parse = createProgressParser('osmium')!;
		expect(parse('stderr', '[==>   ]  7% \r[===>  ]  8% \r')).toBe(8);
	});

	test('joins a percentage split across chunks', () => {
		const parse = createProgressParser('osmium')!;
		expect(feed(parse, 'stderr', ['[====>  ]  4', '5% \r'])).toEqual([undefined, 45]);
	});

	test('never goes backwards and ignores stdout', () => {
		const parse = createProgressParser('osmium')!;
		expect(feed(parse, 'stderr', ['[=>] 50% \r', '[>] 10% \r'])).toEqual([50, undefined]);
		expect(parse('stdout', '99%')).toBeUndefined();
	});
});

test('other commands have no parser', () => {
	expect(createProgressParser('versatiles')).toBeUndefined();
});

test('stripProgress keeps warnings and drops osmium bar redraws', () => {
	const stderr = '[====>     ]  4% \r[=====>    ]  5% \rWarning: something\n[==========] 100% \n\n';
	expect(stripProgress(stderr)).toEqual(['Warning: something']);
});
