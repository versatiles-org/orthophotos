import { assertEquals, assertRejects, assertStringIncludes } from '@std/assert';
import { runCommand, runCommandWithRetry } from './command.ts';

Deno.test('runCommand - executes successful command', async () => {
	const result = await runCommand('echo', ['hello'], { stdout: 'piped' });
	assertEquals(result.success, true);
	assertEquals(result.code, 0);
});

Deno.test('runCommand - captures stdout when piped', async () => {
	const result = await runCommand('echo', ['test output'], { stdout: 'piped' });
	const output = new TextDecoder().decode(result.stdout);
	assertStringIncludes(output, 'test output');
});

Deno.test('runCommand - throws on non-zero exit code', async () => {
	await assertRejects(
		() => runCommand('false', []),
		Error,
		'exited with code',
	);
});

Deno.test('runCommand - respects cwd option', async () => {
	const result = await runCommand('pwd', [], { cwd: '/tmp', stdout: 'piped' });
	const output = new TextDecoder().decode(result.stdout).trim();
	// On macOS /tmp is a symlink to /private/tmp
	assertEquals(output === '/tmp' || output === '/private/tmp', true);
});

Deno.test('runCommand - passes environment variables', async () => {
	const result = await runCommand('sh', ['-c', 'echo $TEST_VAR'], {
		env: { TEST_VAR: 'test_value' },
		stdout: 'piped',
	});
	const output = new TextDecoder().decode(result.stdout).trim();
	assertEquals(output, 'test_value');
});

Deno.test('runCommand - suppresses output with null options', async () => {
	// This should complete without throwing
	const result = await runCommand('echo', ['suppressed'], {
		stdout: 'null',
		stderr: 'null',
	});
	assertEquals(result.success, true);
});

Deno.test('runCommandWithRetry - succeeds on first attempt', async () => {
	const result = await runCommandWithRetry(
		'echo',
		['success'],
		{ maxAttempts: 3, initialDelayMs: 10 },
		{ stdout: 'piped' },
	);
	assertEquals(result.success, true);
});

Deno.test('runCommandWithRetry - throws after max attempts on persistent failure', async () => {
	await assertRejects(
		() =>
			runCommandWithRetry(
				'false',
				[],
				{ maxAttempts: 2, initialDelayMs: 10 },
			),
		Error,
		'exited with code',
	);
});
