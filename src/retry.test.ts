import { expect, test } from 'vitest';
import { withRetry } from './lib/retry.ts';

test('withRetry - succeeds on first attempt', async () => {
	let attempts = 0;
	const result = await withRetry(() => {
		attempts++;
		return Promise.resolve('success');
	});
	expect(result).toBe('success');
	expect(attempts).toBe(1);
});

test('withRetry - retries on failure then succeeds', async () => {
	let attempts = 0;
	const result = await withRetry(
		() => {
			attempts++;
			if (attempts < 3) {
				return Promise.reject(new Error('Temporary failure'));
			}
			return Promise.resolve('success');
		},
		{ initialDelayMs: 10, maxAttempts: 3 },
	);
	expect(result).toBe('success');
	expect(attempts).toBe(3);
});

test('withRetry - throws after max attempts', async () => {
	let attempts = 0;
	await expect(
		withRetry(
			() => {
				attempts++;
				return Promise.reject(new Error('Persistent failure'));
			},
			{ initialDelayMs: 10, maxAttempts: 3 },
		),
	).rejects.toThrow('Persistent failure');
	expect(attempts).toBe(3);
});

test('withRetry - respects custom options', async () => {
	let attempts = 0;
	await expect(
		withRetry(
			() => {
				attempts++;
				return Promise.reject(new Error('Failure'));
			},
			{ initialDelayMs: 5, maxAttempts: 2 },
		),
	).rejects.toThrow();
	expect(attempts).toBe(2);
});

test('withRetry - converts non-Error throws to Error', async () => {
	await expect(
		withRetry(
			() => {
				return Promise.reject('string error');
			},
			{ initialDelayMs: 5, maxAttempts: 1 },
		),
	).rejects.toThrow('string error');
});

test('withRetry - shouldRetry: false aborts immediately, no further attempts', async () => {
	let attempts = 0;
	await expect(
		withRetry(
			() => {
				attempts++;
				return Promise.reject(new Error('LayerNotDefined'));
			},
			{
				initialDelayMs: 5,
				maxAttempts: 3,
				shouldRetry: (err) => !err.message.includes('LayerNotDefined'),
			},
		),
	).rejects.toThrow('LayerNotDefined');
	expect(attempts).toBe(1);
});

test('withRetry - shouldRetry: true keeps retrying as normal', async () => {
	let attempts = 0;
	const result = await withRetry(
		() => {
			attempts++;
			if (attempts < 3) return Promise.reject(new Error('Transient'));
			return Promise.resolve('ok');
		},
		{
			initialDelayMs: 5,
			maxAttempts: 3,
			shouldRetry: () => true,
		},
	);
	expect(result).toBe('ok');
	expect(attempts).toBe(3);
});
