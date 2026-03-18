import { expect, test } from 'vitest';
import { defineRegion, runPipeline, step, type RegionMetadata, type StepContext } from './framework.ts';

const dummyCtx: StepContext = {
	name: 'test/region',
	projDir: '/tmp/proj',
	dataDir: '/tmp/data',
	tempDir: '/tmp/temp',
};

const dummyMeta: RegionMetadata = {
	status: 'success',
	notes: [],
	entries: ['tiles'],
	license: { name: 'CC0', url: 'https://creativecommons.org/publicdomain/zero/1.0/', requiresAttribution: false },
	creator: { name: 'Test', url: 'https://example.com' },
	date: '2024',
};

test('runPipeline - runs steps sequentially and completes', async () => {
	const order: string[] = [];

	const pipeline = defineRegion('test', dummyMeta, [
		step('first', async () => {
			order.push('first');
		}),
		step('second', async () => {
			order.push('second');
		}),
	]);

	await runPipeline(pipeline, dummyCtx);
	expect(order).toEqual(['first', 'second']);
});

test('runPipeline - error message includes step name and timing', async () => {
	const pipeline = defineRegion('test', dummyMeta, [
		step('setup', async () => {}),
		step('download', async () => {
			throw new Error('connection refused');
		}),
	]);

	await expect(runPipeline(pipeline, dummyCtx)).rejects.toThrow(/Step "download" failed after \d+\.\d+s/);
});

test('runPipeline - error message includes original error', async () => {
	const pipeline = defineRegion('test', dummyMeta, [
		step('broken', async () => {
			throw new Error('disk full');
		}),
	]);

	await expect(runPipeline(pipeline, dummyCtx)).rejects.toThrow('disk full');
});

test('runPipeline - stops at first failure', async () => {
	const order: string[] = [];

	const pipeline = defineRegion('test', dummyMeta, [
		step('first', async () => {
			order.push('first');
		}),
		step('failing', async () => {
			order.push('failing');
			throw new Error('boom');
		}),
		step('third', async () => {
			order.push('third');
		}),
	]);

	await expect(runPipeline(pipeline, dummyCtx)).rejects.toThrow('boom');
	expect(order).toEqual(['first', 'failing']);
});

test('runPipeline - empty pipeline completes', async () => {
	const pipeline = defineRegion('test', dummyMeta, []);
	await runPipeline(pipeline, dummyCtx);
});

test('defineRegion - stores id, metadata, and steps', () => {
	const steps = [step('a', async () => {})];
	const pipeline = defineRegion('de/berlin', dummyMeta, steps);
	expect(pipeline.id).toBe('de/berlin');
	expect(pipeline.metadata).toBe(dummyMeta);
	expect(pipeline.steps).toBe(steps);
});
