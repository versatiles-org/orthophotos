import { describe, expect, it } from 'vitest';
import { RemoteZip } from './remote-zip.ts';

// Small CZ orthophoto ZIP (~7.5 MB) with known contents
const TEST_URL = 'https://openzu.cuzk.gov.cz/opendata/OI/302_5550.zip';

describe('RemoteZip', () => {
	it('opens a remote ZIP and lists entries', async () => {
		const zip = await RemoteZip.open(TEST_URL);
		const entries = zip.getEntries();

		expect(entries.length).toBeGreaterThan(0);

		// CZ orthophoto ZIPs contain a JP2 and a J2W worldfile
		const jp2 = entries.find((e) => e.filename.endsWith('.jp2'));
		expect(jp2).toBeDefined();
		expect(jp2!.uncompressedSize).toBeGreaterThan(0);
		expect([0, 8]).toContain(jp2!.compressionMethod); // stored or deflated

		const j2w = entries.find((e) => e.filename.endsWith('.j2w'));
		expect(j2w).toBeDefined();
	}, 30000);

	it('extracts a small file correctly', async () => {
		const zip = await RemoteZip.open(TEST_URL);
		const entries = zip.getEntries();

		// Extract the worldfile (small text file)
		const j2w = entries.find((e) => e.filename.endsWith('.j2w'));
		expect(j2w).toBeDefined();

		const content = await zip.extract(j2w!);
		expect(content.length).toBe(j2w!.uncompressedSize);

		// J2W is a text file with 6 lines of numbers
		const text = content.toString('utf-8').trim();
		const lines = text.split('\n');
		expect(lines.length).toBe(6);
		expect(Number(lines[0])).not.toBeNaN();
	}, 30000);

	it('extracts a large stored file correctly', async () => {
		const zip = await RemoteZip.open(TEST_URL);
		const entries = zip.getEntries();

		const jp2 = entries.find((e) => e.filename.endsWith('.jp2'));
		expect(jp2).toBeDefined();

		const content = await zip.extract(jp2!);
		expect(content.length).toBe(jp2!.uncompressedSize);

		// JP2 files start with a signature
		expect(content[0]).toBe(0x00);
		expect(content[1]).toBe(0x00);
		expect(content[2]).toBe(0x00);
		expect(content[3]).toBe(0x0c);
	}, 60000);

	it('throws on invalid URL', async () => {
		await expect(RemoteZip.open('https://openzu.cuzk.gov.cz/nonexistent.zip')).rejects.toThrow();
	}, 15000);
});
