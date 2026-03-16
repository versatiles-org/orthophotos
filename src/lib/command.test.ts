import { expect, test } from 'vitest';
import { runCommand, runCommandWithRetry } from './command.ts';

test('runCommand - executes successful command', async () => {
	const result = await runCommand('echo', ['hello'], { stdout: 'piped' });
	expect(result.success).toBe(true);
	expect(result.code).toBe(0);
});

test('runCommand - captures stdout when piped', async () => {
	const result = await runCommand('echo', ['test output'], { stdout: 'piped' });
	const output = new TextDecoder().decode(result.stdout);
	expect(output).toContain('test output');
});

test('runCommand - throws on non-zero exit code', async () => {
	await expect(runCommand('false', [])).rejects.toThrow('exited with code');
});

test('runCommand - respects cwd option', async () => {
	const result = await runCommand('pwd', [], { cwd: '/tmp', stdout: 'piped' });
	const output = new TextDecoder().decode(result.stdout).trim();
	// On macOS /tmp is a symlink to /private/tmp
	expect(output === '/tmp' || output === '/private/tmp').toBe(true);
});

test('runCommand - passes environment variables', async () => {
	const result = await runCommand('sh', ['-c', 'echo $TEST_VAR'], {
		env: { TEST_VAR: 'test_value' },
		stdout: 'piped',
	});
	const output = new TextDecoder().decode(result.stdout).trim();
	expect(output).toBe('test_value');
});

test('runCommand - suppresses output with null options', async () => {
	// This should complete without throwing
	const result = await runCommand('echo', ['suppressed'], {
		stdout: 'null',
		stderr: 'null',
	});
	expect(result.success).toBe(true);
});

test('runCommandWithRetry - succeeds on first attempt', async () => {
	const result = await runCommandWithRetry(
		'echo',
		['success'],
		{ maxAttempts: 3, initialDelayMs: 10 },
		{ stdout: 'piped' },
	);
	expect(result.success).toBe(true);
});

test('runCommandWithRetry - throws after max attempts on persistent failure', async () => {
	await expect(
		runCommandWithRetry(
			'false',
			[],
			{ maxAttempts: 2, initialDelayMs: 10 },
		),
	).rejects.toThrow('exited with code');
});
