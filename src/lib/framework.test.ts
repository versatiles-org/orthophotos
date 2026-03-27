import { expect, test } from 'vitest';
import type { RegionMetadata, RegionPipeline, StepContext } from './framework.ts';

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
