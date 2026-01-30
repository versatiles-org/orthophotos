import { assertEquals, assertRejects } from '@std/assert';
import { withRetry } from './lib/retry.ts';

Deno.test('withRetry - succeeds on first attempt', async () => {
	let attempts = 0;
	const result = await withRetry(() => {
		attempts++;
		return Promise.resolve('success');
	});
	assertEquals(result, 'success');
	assertEquals(attempts, 1);
});

Deno.test('withRetry - retries on failure then succeeds', async () => {
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
	assertEquals(result, 'success');
	assertEquals(attempts, 3);
});

Deno.test('withRetry - throws after max attempts', async () => {
	let attempts = 0;
	await assertRejects(
		() =>
			withRetry(
				() => {
					attempts++;
					return Promise.reject(new Error('Persistent failure'));
				},
				{ initialDelayMs: 10, maxAttempts: 3 },
			),
		Error,
		'Persistent failure',
	);
	assertEquals(attempts, 3);
});

Deno.test('withRetry - respects custom options', async () => {
	let attempts = 0;
	await assertRejects(
		() =>
			withRetry(
				() => {
					attempts++;
					return Promise.reject(new Error('Failure'));
				},
				{ initialDelayMs: 5, maxAttempts: 2 },
			),
		Error,
	);
	assertEquals(attempts, 2);
});

Deno.test('withRetry - converts non-Error throws to Error', async () => {
	await assertRejects(
		() =>
			withRetry(
				() => {
					return Promise.reject('string error');
				},
				{ initialDelayMs: 5, maxAttempts: 1 },
			),
		Error,
		'string error',
	);
});
