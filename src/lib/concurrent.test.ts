import { expect, test } from 'vitest';
import { concurrent } from './concurrent.ts';

test('processes all items', async () => {
	const results: number[] = [];
	await concurrent([1, 2, 3, 4, 5], 2, async (item) => {
		results.push(item);
	});
	expect(results.sort()).toEqual([1, 2, 3, 4, 5]);
});

test('respects concurrency limit', async () => {
	let active = 0;
	let maxActive = 0;
	await concurrent([1, 2, 3, 4, 5, 6], 3, async () => {
		active++;
		maxActive = Math.max(maxActive, active);
		await new Promise((r) => setTimeout(r, 10));
		active--;
	});
	expect(maxActive).toBeLessThanOrEqual(3);
	expect(maxActive).toBeGreaterThanOrEqual(2);
});

test('provides correct index', async () => {
	const indices: number[] = [];
	await concurrent(['a', 'b', 'c'], 2, async (_, index) => {
		indices.push(index);
	});
	expect(indices.sort()).toEqual([0, 1, 2]);
});

test('handles empty array', async () => {
	const results: number[] = [];
	await concurrent([], 4, async (item) => {
		results.push(item);
	});
	expect(results).toEqual([]);
});

test('propagates errors', async () => {
	await expect(
		concurrent([1, 2, 3], 2, async (item) => {
			if (item === 2) throw new Error('fail on 2');
		}),
	).rejects.toThrow('fail on 2');
});

test('concurrency higher than items works', async () => {
	const results: number[] = [];
	await concurrent([1, 2], 10, async (item) => {
		results.push(item);
	});
	expect(results.sort()).toEqual([1, 2]);
});

test('works with progress options', async () => {
	const results: string[] = [];
	await concurrent(
		['a', 'b', 'c'],
		2,
		async (item) => {
			results.push(item);
			return item === 'b' ? 'skipped' : 'converted';
		},
		{ labels: ['converted', 'skipped'] },
	);
	expect(results.sort()).toEqual(['a', 'b', 'c']);
});

test('progress with empty array does not error', async () => {
	await concurrent([], 4, async () => 'done', {
		labels: ['done'],
	});
});
