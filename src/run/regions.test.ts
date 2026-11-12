import { describe, expect, test, vi } from 'vitest';
import { runRegions } from './regions.ts';

describe('runRegions', () => {
	test('continues with the next region when one fails, and returns the failures', async () => {
		const ran: string[] = [];
		const onError = vi.fn();
		const failures = await runRegions(
			['de/a', 'de/b', 'de/c'],
			async (name) => {
				ran.push(name);
				if (name === 'de/b') throw new Error('download failed');
			},
			onError,
		);
		expect(ran).toEqual(['de/a', 'de/b', 'de/c']);
		expect(onError).toHaveBeenCalledOnce();
		expect(onError.mock.calls[0][0]).toBe('de/b');
		expect(failures.map((f) => f.name)).toEqual(['de/b']);
	});

	test('returns no failures when every region succeeds', async () => {
		expect(await runRegions(['de/a', 'de/b'], async () => {}, vi.fn())).toEqual([]);
	});

	test('rethrows when the batch is a single region', async () => {
		const onError = vi.fn();
		await expect(
			runRegions(
				['de/a'],
				async () => {
					throw new Error('download failed');
				},
				onError,
			),
		).rejects.toThrow('download failed');
		expect(onError).not.toHaveBeenCalled();
	});
});
