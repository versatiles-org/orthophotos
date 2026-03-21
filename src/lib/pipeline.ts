/**
 * Stream-like pipeline with per-stage concurrency and backpressure.
 *
 * Usage:
 *   import { pipeline, skip } from './pipeline.ts';
 *
 *   await pipeline(items, { progress: { labels: ['converted', 'skipped'] } })
 *     .map(4, async (item) => {
 *       if (exists(item)) return skip('skipped');
 *       return await download(item);
 *     })
 *     .forEach(2, async (path) => {
 *       await convert(path);
 *       return 'converted';
 *     });
 */

import { createProgress, type ProgressOptions } from './progress.ts';

// --- Skip sentinel ---

export class Skip {
	constructor(public readonly label: string) {}
}

export function skip(label: string): Skip {
	return new Skip(label);
}

// --- BoundedChannel ---

const DONE = Symbol('DONE');
type ChannelItem<T> = T | typeof DONE;

class BoundedChannel<T> {
	private buffer: ChannelItem<T>[] = [];
	private readonly capacity: number;
	private closed = false;
	private aborted = false;

	// Waiters blocked on send (buffer full)
	private sendWaiters: (() => void)[] = [];
	// Waiters blocked on receive (buffer empty)
	private receiveWaiters: (() => void)[] = [];

	constructor(capacity: number) {
		this.capacity = Math.max(1, capacity);
	}

	async send(value: T): Promise<boolean> {
		if (this.aborted) return false;
		while (this.buffer.length >= this.capacity) {
			if (this.aborted) return false;
			await new Promise<void>((resolve) => this.sendWaiters.push(resolve));
			if (this.aborted) return false;
		}
		this.buffer.push(value);
		this.notifyOne(this.receiveWaiters);
		return true;
	}

	async receive(): Promise<ChannelItem<T>> {
		while (this.buffer.length === 0) {
			if (this.aborted) return DONE;
			await new Promise<void>((resolve) => this.receiveWaiters.push(resolve));
			if (this.aborted) return DONE;
		}
		const value = this.buffer.shift()!;
		this.notifyOne(this.sendWaiters);
		// Re-push DONE so other workers also see it
		if (value === DONE) {
			this.buffer.push(DONE);
			this.notifyAll(this.receiveWaiters);
		}
		return value;
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.buffer.push(DONE);
		this.notifyAll(this.receiveWaiters);
	}

	abort(): void {
		this.aborted = true;
		this.notifyAll(this.sendWaiters);
		this.notifyAll(this.receiveWaiters);
	}

	private notifyOne(waiters: (() => void)[]): void {
		const w = waiters.shift();
		if (w) w();
	}

	private notifyAll(waiters: (() => void)[]): void {
		const batch = waiters.splice(0);
		for (const w of batch) w();
	}
}

// --- Pipeline builder ---

interface StageDescriptor {
	concurrency: number;
	fn: (item: unknown) => Promise<unknown>;
}

interface PipelineOptions {
	progress?: ProgressOptions;
}

class PipelineBuilder<T> {
	private stages: StageDescriptor[] = [];

	constructor(
		private readonly items: T[],
		private readonly options: PipelineOptions,
	) {}

	map<U>(concurrency: number, fn: (item: T) => Promise<U | Skip | null | undefined | void>): PipelineBuilder<U> {
		this.stages.push({ concurrency, fn: fn as (item: unknown) => Promise<unknown> });
		return this as unknown as PipelineBuilder<U>;
	}

	async forEach(concurrency: number, fn: (item: T) => Promise<string | void>): Promise<void> {
		this.stages.push({ concurrency, fn: fn as (item: unknown) => Promise<unknown> });
		await this.execute();
	}

	async run(): Promise<void> {
		await this.execute();
	}

	private async execute(): Promise<void> {
		const { items, stages, options } = this;

		if (items.length === 0) {
			if (options.progress) {
				const progress = createProgress(0, options.progress);
				progress.done();
			}
			return;
		}

		if (stages.length === 0) return;

		const progress = options.progress ? createProgress(items.length, options.progress) : undefined;

		// Create channels: one between each pair of stages, plus input channel
		const channels: BoundedChannel<unknown>[] = [];
		// Channel 0 feeds stage 0 (capacity = stage 0 concurrency)
		channels.push(new BoundedChannel(stages[0].concurrency));
		for (let i = 1; i < stages.length; i++) {
			channels.push(new BoundedChannel(stages[i].concurrency));
		}

		const isLastStage = (i: number) => i === stages.length - 1;
		let firstError: unknown = undefined;

		function abortAll(): void {
			for (const ch of channels) ch.abort();
		}

		// Feeder: pump source items into channel 0
		const feeder = (async () => {
			try {
				for (const item of items) {
					if (!(await channels[0].send(item))) break;
				}
			} finally {
				channels[0].close();
			}
		})();

		// Stage workers
		const allWorkers: Promise<void>[] = [feeder];

		for (let stageIdx = 0; stageIdx < stages.length; stageIdx++) {
			const stage = stages[stageIdx];
			const inputChannel = channels[stageIdx];
			const outputChannel = !isLastStage(stageIdx) ? channels[stageIdx + 1] : undefined;
			const last = isLastStage(stageIdx);

			const workers = Array.from({ length: stage.concurrency }, async () => {
				// eslint-disable-next-line no-constant-condition
				while (true) {
					const item = await inputChannel.receive();
					if (item === DONE) break;

					try {
						const result = await stage.fn(item);

						if (result instanceof Skip) {
							if (progress) progress.tick(result.label);
							continue;
						}

						if (result === null || result === undefined) {
							continue;
						}

						if (last) {
							// forEach terminal: result is a label string
							if (progress && typeof result === 'string') {
								progress.tick(result);
							}
						} else if (outputChannel) {
							await outputChannel.send(result);
						}
					} catch (err) {
						if (!firstError) {
							firstError = err;
							abortAll();
						}
						break;
					}
				}
			});

			// When all workers of this stage finish, close the output channel
			const stagePromise = Promise.allSettled(workers).then(() => {
				if (outputChannel) outputChannel.close();
			});

			allWorkers.push(stagePromise);
		}

		await Promise.allSettled(allWorkers);

		if (progress) progress.done();

		if (firstError) throw firstError;
	}
}

export function pipeline<T>(items: T[], options: PipelineOptions = {}): PipelineBuilder<T> {
	return new PipelineBuilder(items, options);
}
