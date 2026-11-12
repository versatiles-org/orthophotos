import { beforeEach, describe, expect, test, vi } from 'vitest';

const downloadFile = vi.fn();
const runCommand = vi.fn();

vi.mock('../../lib/index.ts', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../lib/index.ts')>()),
	downloadFile: (...args: unknown[]) => downloadFile(...args),
	runCommand: (...args: unknown[]) => runCommand(...args),
}));

const { downloadUnlessMissing } = await import('./baden_wuerttemberg.ts');

function status(code: string) {
	return { stdout: new TextEncoder().encode(code), stderr: new Uint8Array(), code: 0, success: true };
}

describe('downloadUnlessMissing', () => {
	beforeEach(() => {
		downloadFile.mockReset();
		runCommand.mockReset();
	});

	test('returns true when the download works', async () => {
		downloadFile.mockResolvedValue(undefined);
		await expect(downloadUnlessMissing('https://x/a.zip', '/tmp/a.zip')).resolves.toBe(true);
		expect(runCommand).not.toHaveBeenCalled();
	});

	test('returns false when the server answers 404', async () => {
		downloadFile.mockRejectedValue(new Error('curl exit 22'));
		runCommand.mockResolvedValue(status('404'));
		await expect(downloadUnlessMissing('https://x/a.zip', '/tmp/a.zip')).resolves.toBe(false);
	});

	test('rethrows the download error for any other status', async () => {
		downloadFile.mockRejectedValue(new Error('curl exit 22'));
		runCommand.mockResolvedValue(status('503'));
		await expect(downloadUnlessMissing('https://x/a.zip', '/tmp/a.zip')).rejects.toThrow('curl exit 22');
	});

	test('rethrows the download error when the status probe fails too', async () => {
		downloadFile.mockRejectedValue(new Error('curl exit 6'));
		runCommand.mockRejectedValue(new Error('probe failed'));
		await expect(downloadUnlessMissing('https://x/a.zip', '/tmp/a.zip')).rejects.toThrow('curl exit 6');
	});
});
