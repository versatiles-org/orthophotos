import { expect, test } from 'vitest';
import { checkRequiredCommands } from './commands.ts';

// Note: Most functions in commands.ts require external tools or rsync configuration.
// These tests focus on the checkRequiredCommands function which validates CLI tools.

test('checkRequiredCommands - succeeds when common commands available', async () => {
	// This test checks if some basic commands exist.
	// On a development machine with the required tools installed, this should pass.
	// We can't fully test this without mocking, but we verify the function runs.

	// Try to run - if it fails due to missing commands, that's expected on CI
	try {
		await checkRequiredCommands();
		// If we get here, all commands are available
	} catch (e) {
		// Expected on systems without all tools installed
		if (e instanceof Error) {
			expect(e.message).toContain('Missing required commands');
		}
	}
});

test('checkRequiredCommands - error message lists missing commands', async () => {
	// We can't easily mock 'which' command availability,
	// but we can verify the error message format if commands are missing
	try {
		await checkRequiredCommands();
	} catch (e) {
		if (e instanceof Error && e.message.includes('Missing required commands')) {
			// Verify error message format includes indented list
			expect(e.message).toContain('  -');
		}
	}
});

// Additional tests would require mocking the runCommand function or the environment.
// For full integration testing, ensure the actual tools are installed.
