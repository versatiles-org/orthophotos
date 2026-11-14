import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, expect, test, vi } from 'vitest';
import { QUALITY } from './constants.ts';

const dataDir = mkdtempSync(join(tmpdir(), 'quality-map-'));
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

vi.mock('./config.ts', () => ({ getConfig: () => ({ dirData: dataDir, dirTemp: dataDir }) }));

const { getQualityMapPath, requireQualityMap } = await import('./quality-map.ts');

test('the map is expected in dir_data', () => {
	expect(getQualityMapPath()).toBe(join(dataDir, 'settlement_proximity.png'));
});

test('a missing map fails early, naming how to build it', () => {
	expect(() => requireQualityMap()).toThrow(/settlement_proximity\.png" is missing.*build:quality-zones/);
});

test('an existing map is returned', () => {
	writeFileSync(getQualityMapPath(), 'png');
	expect(requireQualityMap()).toBe(getQualityMapPath());
});

test('QUALITY uses ranges only where the map chooses, from zoom 16 on', () => {
	expect(QUALITY).toMatch(/^70,16:30-50,17:10-30,/);
});
