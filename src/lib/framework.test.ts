import { expect, test } from 'vitest';
import { MAX_ZOOM } from './constants.ts';
import { getMaxZoom, type RegionMetadata, type RegionPipeline, type StepContext } from './framework.ts';

const dummyCtx: StepContext = {
	name: 'test/region',
	dataDir: '/tmp/data',
	tempDir: '/tmp/temp',
};

const dummyMeta: RegionMetadata = {
	status: 'released',
	notes: [],
	license: { name: 'CC0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', requiresAttribution: false },
	creator: { name: 'Test', url: 'https://example.com' },
	date: '2024',
	releaseDate: '2025-02-03',
};

test('RegionPipeline - run executes correctly', async () => {
	let called = false;
	const pipeline: RegionPipeline = {
		id: 'test',
		metadata: dummyMeta,
		run: async () => {
			called = true;
		},
	};
	await pipeline.run!(dummyCtx);
	expect(called).toBe(true);
});

test('RegionPipeline - run is optional for stub regions', () => {
	const pipeline: RegionPipeline = {
		id: 'test/stub',
		metadata: { status: 'blocked', notes: ['Not available'] },
	};
	expect(pipeline.run).toBeUndefined();
	expect(pipeline.id).toBe('test/stub');
	expect(pipeline.metadata.status).toBe('blocked');
});

test('RegionPipeline - stores id and metadata', () => {
	const pipeline: RegionPipeline = {
		id: 'de/berlin',
		metadata: dummyMeta,
		run: async () => {},
	};
	expect(pipeline.id).toBe('de/berlin');
	expect(pipeline.metadata).toBe(dummyMeta);
});

test('RegionPipeline - run receives context', async () => {
	let receivedCtx: StepContext | undefined;
	const pipeline: RegionPipeline = {
		id: 'test',
		metadata: dummyMeta,
		run: async (ctx) => {
			receivedCtx = ctx;
		},
	};
	await pipeline.run!(dummyCtx);
	expect(receivedCtx).toBe(dummyCtx);
});

test('getMaxZoom - defaults to MAX_ZOOM', () => {
	expect(getMaxZoom(dummyMeta)).toBe(MAX_ZOOM);
});

test("getMaxZoom - uses the region's own value", () => {
	expect(getMaxZoom({ ...dummyMeta, maxZoom: 16 })).toBe(16);
	expect(getMaxZoom({ ...dummyMeta, maxZoom: 19 })).toBe(19);
});

test('getMaxZoom - rejects values that are not a zoom level', () => {
	expect(() => getMaxZoom({ ...dummyMeta, maxZoom: 17.5 })).toThrow('maxZoom');
	expect(() => getMaxZoom({ ...dummyMeta, maxZoom: -1 })).toThrow('maxZoom');
	expect(() => getMaxZoom({ ...dummyMeta, maxZoom: 23 })).toThrow('maxZoom');
});
