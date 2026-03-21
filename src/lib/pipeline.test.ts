import { describe, expect, it } from 'vitest';
import { pipeline, skip } from './pipeline.ts';

describe('pipeline', () => {
	it('passes items through map to forEach', async () => {
		const results: number[] = [];
		await pipeline([1, 2, 3])
			.map(2, async (n) => n * 10)
			.forEach(2, async (n) => {
				results.push(n);
			});
		expect(results.sort((a, b) => a - b)).toEqual([10, 20, 30]);
	});

	it('transforms types across stages', async () => {
		const results: string[] = [];
		await pipeline([1, 2, 3])
			.map(2, async (n) => ({ value: n.toString() }))
			.map(2, async (obj) => obj.value + '!')
			.forEach(1, async (s) => {
				results.push(s);
			});
		expect(results.sort()).toEqual(['1!', '2!', '3!']);
	});

	it('filters out null values', async () => {
		const results: number[] = [];
		await pipeline([1, 2, 3, 4, 5])
			.map(2, async (n) => {
				if (n % 2 === 0) return null;
				return n;
			})
			.forEach(2, async (n) => {
				results.push(n);
			});
		expect(results.sort((a, b) => a - b)).toEqual([1, 3, 5]);
	});

	it('filters with skip() and ticks progress', async () => {
		const results: number[] = [];
		await pipeline([1, 2, 3, 4], { progress: { labels: ['done', 'skipped'] } })
			.map(2, async (n) => {
				if (n % 2 === 0) return skip('skipped');
				return n;
			})
			.forEach(2, async (n) => {
				results.push(n);
				return 'done';
			});
		expect(results.sort((a, b) => a - b)).toEqual([1, 3]);
	});

	it('enforces backpressure from downstream', async () => {
		// Track how many items are in-flight between stages
		let inFlight = 0;
		let maxInFlight = 0;
		const downstreamConcurrency = 2;

		await pipeline(Array.from({ length: 20 }, (_, i) => i))
			.map(4, async (n) => {
				inFlight++;
				maxInFlight = Math.max(maxInFlight, inFlight);
				return n;
			})
			.forEach(downstreamConcurrency, async (n) => {
				inFlight--;
				// Simulate slow downstream
				await new Promise((r) => setTimeout(r, 10));
				return 'done';
			});

		// maxInFlight should be bounded; with channel capacity = downstream concurrency,
		// upstream can produce at most concurrency + buffer items ahead
		expect(maxInFlight).toBeLessThanOrEqual(4 + downstreamConcurrency + 1);
	});

	it('respects per-stage concurrency limits', async () => {
		let activeConcurrency = 0;
		let maxConcurrency = 0;
		const limit = 2;

		await pipeline(Array.from({ length: 10 }, (_, i) => i)).forEach(limit, async () => {
			activeConcurrency++;
			maxConcurrency = Math.max(maxConcurrency, activeConcurrency);
			await new Promise((r) => setTimeout(r, 10));
			activeConcurrency--;
		});

		expect(maxConcurrency).toBeLessThanOrEqual(limit);
	});

	it('rejects on error without hanging', async () => {
		const error = new Error('stage failure');
		await expect(
			pipeline([1, 2, 3, 4, 5])
				.map(2, async (n) => {
					if (n === 3) throw error;
					await new Promise((r) => setTimeout(r, 10));
					return n;
				})
				.forEach(2, async () => {
					return 'done';
				}),
		).rejects.toThrow('stage failure');
	});

	it('handles empty input', async () => {
		const results: number[] = [];
		await pipeline([])
			.map(2, async (n: number) => n)
			.forEach(2, async (n) => {
				results.push(n);
			});
		expect(results).toEqual([]);
	});

	it('works with forEach only (no map)', async () => {
		const results: number[] = [];
		await pipeline([1, 2, 3]).forEach(2, async (n) => {
			results.push(n);
		});
		expect(results.sort((a, b) => a - b)).toEqual([1, 2, 3]);
	});

	it('drains with .run() terminal', async () => {
		let count = 0;
		await pipeline([1, 2, 3])
			.map(2, async (n) => {
				count++;
				return n;
			})
			.run();
		expect(count).toBe(3);
	});

	it('handles multi-stage chain (3+ stages)', async () => {
		const results: string[] = [];
		await pipeline([1, 2, 3])
			.map(2, async (n) => n * 2)
			.map(2, async (n) => n + 1)
			.map(1, async (n) => `v${n}`)
			.forEach(2, async (s) => {
				results.push(s);
			});
		expect(results.sort()).toEqual(['v3', 'v5', 'v7']);
	});
});
