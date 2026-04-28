import { beforeAll, describe, expect, it } from 'vitest';
import { RemoteZip } from './remote-zip.ts';

// OSM water polygons (split, 4326) — large file (~900 MB) but RemoteZip only
// fetches the tail (central directory) plus a few KB per extracted entry. Hosted
// on osmdata.openstreetmap.de, which serves real HTTP range requests. The archive
// is regenerated on a regular cadence, so tests assert structure rather than
// exact byte content.
const TEST_URL = 'https://osmdata.openstreetmap.de/download/water-polygons-split-4326.zip';

describe('RemoteZip', () => {
	let zip: RemoteZip;

	beforeAll(async () => {
		zip = await RemoteZip.open(TEST_URL);
	}, 30000);

	it('lists the expected shapefile entries', () => {
		const filenames = zip.getEntries().map((e) => e.filename);
		expect(filenames.some((f) => f.endsWith('.shp'))).toBe(true);
		expect(filenames.some((f) => f.endsWith('.dbf'))).toBe(true);
		expect(filenames.some((f) => f.endsWith('.prj'))).toBe(true);
		expect(filenames.some((f) => f.endsWith('.cpg'))).toBe(true);
		expect(filenames.some((f) => f.endsWith('.shx'))).toBe(true);
	});

	it('extracts a stored (uncompressed) entry correctly', async () => {
		const cpg = zip.getEntries().find((e) => e.filename.endsWith('.cpg'));
		expect(cpg).toBeDefined();
		expect(cpg!.compressionMethod).toBe(0);

		const content = await zip.extract(cpg!);
		expect(content.length).toBe(cpg!.uncompressedSize);
		// .cpg names the codepage as a short ASCII string (e.g. "UTF-8").
		expect(content.toString('utf-8').trim()).toMatch(/^[\w-]+$/);
	}, 30000);

	it('extracts a deflated entry correctly', async () => {
		const prj = zip.getEntries().find((e) => e.filename.endsWith('.prj'));
		expect(prj).toBeDefined();
		expect(prj!.compressionMethod).toBe(8);
		// Real compression should reduce a WKT string.
		expect(prj!.compressedSize).toBeLessThan(prj!.uncompressedSize);

		const content = await zip.extract(prj!);
		expect(content.length).toBe(prj!.uncompressedSize);
		// .prj is a WKT projection definition; starts with GEOGCS or PROJCS.
		expect(content.toString('utf-8')).toMatch(/^(GEOGCS|PROJCS)/);
	}, 30000);

	it('throws on invalid URL', async () => {
		await expect(RemoteZip.open('https://osmdata.openstreetmap.de/download/nonexistent.zip')).rejects.toThrow();
	}, 15000);
});
