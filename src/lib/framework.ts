/**
 * Step-based framework for region pipeline definitions.
 */

export interface StepContext {
	name: string;
	dataDir: string;
	tempDir: string;
}

export interface Step {
	name: string;
	run: (ctx: StepContext) => Promise<void>;
}

export interface RegionLicense {
	name: string;
	url: string;
	requiresAttribution: boolean;
}

export interface RegionCreator {
	name: string;
	url: string;
}

export interface RegionMetadata {
	status: 'success' | 'error';
	notes: string[];
	entries?: string[];
	license?: RegionLicense;
	creator?: RegionCreator;
	date?: string;
}

export interface RegionPipeline {
	id: string;
	metadata: RegionMetadata;
	steps: Step[];
}

/**
 * Creates a step from a plain async function.
 */
export function step(name: string, fn: (ctx: StepContext) => Promise<void>): Step {
	return { name, run: fn };
}

/**
 * Defines a region's fetch pipeline as a sequence of steps with metadata.
 */
export function defineRegion(id: string, metadata: RegionMetadata, steps: Step[]): RegionPipeline {
	return { id, metadata, steps };
}

/**
 * Runs all steps for a region sequentially, with timing and error context.
 */
export async function runPipeline(pipeline: RegionPipeline, ctx: StepContext): Promise<void> {
	console.log(`Running pipeline for ${pipeline.id} (${pipeline.steps.length} steps)`);

	for (const s of pipeline.steps) {
		const start = performance.now();
		console.log(`  [${s.name}] starting...`);

		try {
			await s.run(ctx);
		} catch (err) {
			const elapsed = ((performance.now() - start) / 1000).toFixed(1);
			const message = err instanceof Error ? err.message : String(err);
			throw new Error(`Step "${s.name}" failed after ${elapsed}s: ${message}`);
		}

		const elapsed = ((performance.now() - start) / 1000).toFixed(1);
		console.log(`  [${s.name}] completed in ${elapsed}s`);
	}
}
